import React, { useState, useEffect, useRef } from "react";
import {
  sendMessage,
  analyzeProduct,
  getHistory,
  deleteMessage,
  getTrash,
  restoreMessage,
  purgeSession,
} from "./api";
import "./App.css";

/* ─────────────────────────────────────────
   PRODUCT CARD COMPONENT
   High-contrast emerald border, buy buttons
───────────────────────────────────────── */
function ProductCard({ card }) {
  if (!card) return null;
  const ecoColor = { a: "#50C878", b: "#8BC34A", c: "#FFC107", d: "#FF9800", e: "#f44336" };
  const grade = (card.eco_score || "").toLowerCase();

  return (
    <div className="product-card">
      <div className="pc-header">
        <div className="pc-name">{card.name}</div>
        {card.brand && <div className="pc-brand">{card.brand}</div>}
      </div>

      <div className="pc-badges">
        {card.eco_score && card.eco_score !== "N/A" && (
          <span
            className="pc-badge"
            style={{ background: ecoColor[grade] || "#aaa", color: "#fff" }}
          >
            Eco {card.eco_score.toUpperCase()}
          </span>
        )}
        {typeof card.eco_points === "number" && (
          <span className="pc-badge pc-badge--points">
            {card.eco_points > 0 ? `+${card.eco_points}` : card.eco_points} pts
          </span>
        )}
      </div>

      {card.links && (
        <div className="pc-actions">
          {card.links.amazon && (
            <a className="pc-btn pc-btn--online" href={card.links.amazon} target="_blank" rel="noreferrer">
              Amazon ↗
            </a>
          )}
          {card.links.flipkart && (
            <a className="pc-btn pc-btn--online" href={card.links.flipkart} target="_blank" rel="noreferrer">
              Flipkart ↗
            </a>
          )}
          <button
            className="pc-btn pc-btn--offline"
            onClick={() =>
              alert(`Search for "${card.name}" at your nearest grocery or eco-store.`)
            }
          >
            Find Offline
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN APP
───────────────────────────────────────── */
export default function App() {
  const [messages, setMessages]   = useState([]);
  const [trash, setTrash]         = useState([]);
  const [view, setView]           = useState("chat");
  const [input, setInput]         = useState("");
  const [theme, setTheme]         = useState(localStorage.getItem("theme") || "light");
  const [persona, setPersona]     = useState("Eco Analyst");
  const [pulsing, setPulsing]     = useState(false);
  const [cameraOn, setCameraOn]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [scanLoading, setScanLoading] = useState(false);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const chatRef   = useRef(null);

  /* ── Load history ── */
  useEffect(() => { loadChat(); }, []);

  const loadChat = async () => {
    try {
      const res = await getHistory();
      setMessages(res.data || []);
    } catch { /* silently fail if backend down */ }
  };

  const loadTrash = async () => {
    try {
      const res = await getTrash();
      setTrash(res.data || []);
    } catch { /* silently fail */ }
  };

  /* ── Scroll to bottom ── */
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /* ── Persona pulse trigger ── */
  const triggerPersona = (label) => {
    setPersona(label);
    setPulsing(true);
    setTimeout(() => setPulsing(false), 1400);
  };

  /* ── Theme ── */
  const toggleTheme = () => {
    const t = theme === "light" ? "dark" : "light";
    setTheme(t);
    localStorage.setItem("theme", t);
  };

  /* ── Send chat ── */
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await sendMessage(text);
      const { reply, persona: p } = res.data;
      triggerPersona(p || "Eco Analyst");
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Backend not responding. Check your server." }]);
    } finally {
      setLoading(false);
    }
  };

  /* ── Delete / restore ── */
  const handleDelete = async (id) => {
    await deleteMessage(id);
    loadChat();
  };

  const handleRestore = async (id) => {
    await restoreMessage(id);
    loadTrash();
  };

  /* ── Revolution Protocol (purge) ── */
  const handlePurge = async () => {
    if (!window.confirm("Reset the Pulse? This will archive all current messages.")) return;
    await purgeSession();
    setMessages([]);
    triggerPersona("Eco Analyst");
  };

  /* ── Camera ── */
  const startCamera = async () => {
    try {
      setCameraOn(true);
      await new Promise(r => setTimeout(r, 100)); // let DOM mount
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      alert("Camera permission denied.");
      setCameraOn(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    setCameraOn(false);
  };

  const capture = () => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    stopCamera();
    setScanLoading(true);

    canvas.toBlob(async (blob) => {
      try {
        const formData = new FormData();
        formData.append("file", blob, "scan.jpg");
        const res = await analyzeProduct(formData);
        const { reply, persona: p, product_card, expiry, storage } = res.data;

        triggerPersona(p || "Eco Analyst");

        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: reply,
            product_card,
            meta: { expiry, storage },
          },
        ]);
      } catch {
        setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Scan failed. Try better lighting." }]);
      } finally {
        setScanLoading(false);
      }
    }, "image/jpeg", 0.92);
  };

  /* ── Render message content with markdown-lite ── */
  const renderContent = (content) => {
    if (!content) return null;
    return content.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h3 key={i} className="md-h2">{line.slice(3)}</h3>;
      if (line.startsWith("# "))  return <h2 key={i} className="md-h1">{line.slice(2)}</h2>;
      if (line.startsWith("**") && line.endsWith("**")) {
        return <p key={i} className="md-bold">{line.slice(2, -2)}</p>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={i} className="md-li">{line.slice(2)}</li>;
      }
      if (line.trim() === "") return <br key={i} />;
      return <p key={i} className="md-p">{line}</p>;
    });
  };

  return (
    <div className="app" data-theme={theme}>

      {/* ── NAV ── */}
      <nav className="nav">
        <div className={`persona-chip ${pulsing ? "pulsing" : ""}`}>
          <span className="pulse-dot" />
          {persona}
        </div>

        <div className="nav-actions">
          <button className="nav-btn" onClick={() => { setView("chat"); loadChat(); }} title="Chat">
            💬
          </button>
          <button className="nav-btn" onClick={() => { setView("trash"); loadTrash(); }} title="Trash">
            🗑
          </button>
          <button className="nav-btn danger" onClick={handlePurge} title="Reset Pulse">
            ⚡ Reset
          </button>
          <button className="nav-btn theme-btn" onClick={toggleTheme}>
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div className="hero" onClick={() => { setMessages([]); loadChat(); }} title="Refresh">
        <div className="leaf-icon">🍃</div>
        <p className="hero-sub">
          {loading || scanLoading ? "Analysing…" : "EcoBot is listening"}
        </p>
      </div>

      {/* ── CHAT VIEW ── */}
      {view === "chat" && (
        <div className="chat" ref={chatRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <p>Start a conversation or scan a product label to begin.</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg msg--${m.role}`}>
              <div className="bubble">
                <div className="bubble-content">
                  {renderContent(m.content)}
                </div>

                {/* Expiry + Storage meta */}
                {m.meta && (
                  <div className="meta-pills">
                    {m.meta.expiry && (
                      <span className={`meta-pill expiry-${m.meta.expiry.toLowerCase().replace(" ", "-")}`}>
                        ⏳ {m.meta.expiry}
                      </span>
                    )}
                    {m.meta.storage && (
                      <span className="meta-pill meta-pill--storage">
                        🧊 {m.meta.storage}
                      </span>
                    )}
                  </div>
                )}

                {/* Product card */}
                {m.product_card && <ProductCard card={m.product_card} />}
              </div>

              {m.id && (
                <button className="delete-btn" onClick={() => handleDelete(m.id)} title="Delete">✕</button>
              )}
            </div>
          ))}

          {(loading || scanLoading) && (
            <div className="msg msg--assistant">
              <div className="bubble bubble--loading">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRASH VIEW ── */}
      {view === "trash" && (
        <div className="trash-panel">
          {trash.length === 0 && <p className="empty-state">Trash is empty.</p>}
          {trash.map((m) => (
            <div key={m.id} className="trash-item">
              <span className="trash-role">{m.role}</span>
              <p className="trash-content">{m.content}</p>
              <button className="restore-btn" onClick={() => handleRestore(m.id)}>
                ♻ Restore
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── INPUT BAR ── */}
      {view === "chat" && (
        <div className="input-bar">
          <div className="input-wrapper">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask EcoBot anything…"
              disabled={loading}
            />
            <button className="btn-send" onClick={handleSend} disabled={loading || !input.trim()}>
              Send
            </button>
            <button className="btn-camera" onClick={startCamera} title="Scan product">
              📸
            </button>
          </div>
        </div>
      )}

      {/* ── CAMERA MODAL ── */}
      {cameraOn && (
        <div className="camera-overlay">
          <div className="camera-modal">
            <div className="camera-header">
              <span>Point at product label or barcode</span>
              <button className="close-btn" onClick={stopCamera}>✕</button>
            </div>
            <video ref={videoRef} autoPlay playsInline className="camera-feed" />
            <div className="camera-footer">
              <button className="btn-capture" onClick={capture}>
                Capture
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
