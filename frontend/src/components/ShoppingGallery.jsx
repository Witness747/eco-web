import { useState, useEffect } from "react";
import { getShoppingGallery } from "../api";

const CATEGORIES = [
  { key: "all",      label: "All" },
  { key: "clothing", label: "Clothing" },
  { key: "home",     label: "Home & Kitchen" },
  { key: "care",     label: "Personal Care" },
  { key: "beauty",   label: "Beauty" },
  { key: "grocery",  label: "Grocery" },
];

const ECO_COLORS = {
  "A+": { bg: "#E1F5EE", text: "#085041", border: "#1D9E75" },
  "A":  { bg: "#EAF3DE", text: "#27500A", border: "#639922" },
  "B":  { bg: "#FAEEDA", text: "#633806", border: "#EF9F27" },
};

export default function ShoppingGallery() {
  const [products, setProducts]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch]             = useState("");
  const [expanded, setExpanded]         = useState(null);

  useEffect(() => { fetchProducts(activeCategory); }, [activeCategory]);

  async function fetchProducts(category) {
    setLoading(true);
    try {
      const res = await getShoppingGallery(category);
      setProducts(res.data.products || []);
    } catch (e) {
      console.error("Gallery fetch failed:", e);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", padding: "0 0 32px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        marginBottom: "20px", padding: "16px",
        background: "linear-gradient(135deg, #E1F5EE 0%, #EAF3DE 100%)",
        borderRadius: "16px", border: "0.5px solid #9FE1CB",
      }}>
        <div style={{
          width: "44px", height: "44px", borderRadius: "50%",
          background: "#1D9E75", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: "22px", flexShrink: 0,
        }}>🌿</div>
        <div>
          <p style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: "17px", color: "#085041" }}>
            Eco-Friendly Shopping Gallery
          </p>
          <p style={{ margin: 0, fontSize: "13px", color: "#0F6E56", marginTop: "2px" }}>
            {filtered.length} curated brands across {CATEGORIES.length - 1} categories
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "14px" }}>
        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", opacity: 0.4 }}>🔍</span>
        <input
          type="text"
          placeholder="Search brands..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px 10px 36px",
            borderRadius: "10px", border: "0.5px solid #D3D1C7",
            fontSize: "13px", background: "var(--input-bg, #fff)",
            color: "var(--text, #111)", boxSizing: "border-box", outline: "none",
          }}
        />
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
        {CATEGORIES.map(cat => (
          <button key={cat.key}
            onClick={() => { setActiveCategory(cat.key); setExpanded(null); }}
            style={{
              fontSize: "12px", padding: "6px 14px", borderRadius: "20px", cursor: "pointer",
              border: activeCategory === cat.key ? "1.5px solid #1D9E75" : "0.5px solid #D3D1C7",
              background: activeCategory === cat.key ? "#E1F5EE" : "transparent",
              color: activeCategory === cat.key ? "#085041" : "#666",
              fontWeight: activeCategory === cat.key ? 500 : 400,
              transition: "all 0.15s",
            }}
          >{cat.label}</button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888", fontSize: "14px" }}>
          Loading eco picks...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888", fontSize: "14px" }}>
          No brands found. Try a different search or category.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: "10px" }}>
          {filtered.map(product => {
            const eco = ECO_COLORS[product.eco_grade] || ECO_COLORS["B"];
            const isExpanded = expanded === product.id;
            return (
              <div key={product.id}
                onClick={() => setExpanded(isExpanded ? null : product.id)}
                style={{
                  background: "var(--surface, #fff)",
                  border: isExpanded ? "1.5px solid #1D9E75" : "0.5px solid #D3D1C7",
                  borderRadius: "14px", padding: "14px", cursor: "pointer",
                  transition: "all 0.15s",
                  gridColumn: isExpanded ? "span 2" : "span 1",
                }}
              >
                {/* Icon + Badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: eco.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                    {product.icon}
                  </div>
                  <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "20px", background: eco.bg, color: eco.text, border: `0.5px solid ${eco.border}`, fontWeight: 500 }}>
                    {product.eco_grade} eco
                  </span>
                </div>

                <p style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 500 }}>{product.name}</p>
                <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#888", textTransform: "capitalize" }}>{product.category}</p>
                <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#666", lineHeight: 1.5 }}>{product.description}</p>

                {/* Expanded shop links */}
                {isExpanded && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "10px", borderTop: "0.5px solid #D3D1C7" }}>
                    <a href={product.url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "20px", textDecoration: "none", background: "#1D9E75", color: "#fff", fontWeight: 500 }}>
                      Visit site ↗
                    </a>
                    <a href={`https://www.amazon.in/s?k=${encodeURIComponent(product.name)}+eco`}
                      target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "20px", textDecoration: "none", border: "0.5px solid #D3D1C7", color: "#666", background: "transparent" }}>
                      Amazon.in ↗
                    </a>
                    <a href={`https://www.flipkart.com/search?q=${encodeURIComponent(product.name)}`}
                      target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "20px", textDecoration: "none", border: "0.5px solid #D3D1C7", color: "#666", background: "transparent" }}>
                      Flipkart ↗
                    </a>
                  </div>
                )}

                {!isExpanded && (
                  <p style={{ margin: 0, fontSize: "11px", color: "#aaa" }}>Tap to shop →</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
