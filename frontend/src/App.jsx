import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [persona, setPersona] = useState('Thinking green thoughts...');
  const [theme, setTheme] = useState('light');
  const chatEndRef = useRef(null);

  // Auto-scroll to let the AI feedback "breath" as it grows
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = { role: 'user', content: input };
    setMessages([...messages, userMsg]);
    setInput('');

    try {
      // Points to your Render backend
      const res = await axios.post('https://ecobot-api.onrender.com/api/chat', { message: input });
      
      const assistantMsg = { role: 'assistant', content: res.data.reply };
      setMessages(prev => [...prev, assistantMsg]);
      setPersona(res.data.persona);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I'm having trouble connecting to my roots. Please check your internet connection." 
      }]);
    }
  };

  return (
    <div className="app-container" data-theme={theme}>
      {/* 1. Professional Top Nav: Corners-only arrangement */}
      <nav className="top-nav">
        <div className="persona-chip">{persona}</div>
        <button onClick={toggleTheme} className="theme-toggle">
          {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
      </nav>

      <main className="main-content">
        {/* 2. Simplified Hero: Only the Leaf, No Square Clutter */}
        {messages.length === 0 && (
          <div className="hero-section">
            <div className="leaf-logo">🍃</div> 
            <p className="interactive-text">How can we make your day more sustainable?</p>
          </div>
        )}

        {/* 3. Wide Article-Pattern Chat Window */}
        <div className="chat-window">
          {messages.map((msg, i) => (
            <div key={i} className={`message-row ${msg.role}`}>
              <div className="bubble">
                {/* AI feedback is rendered with spacing for an "article" feel */}
                <div className="content-text">{msg.content}</div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* 4. Professional Bottom Bar: Spaced horizontally */}
      <footer className="input-area">
        <div className="input-wrapper">
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your eco-request here..."
          />
          <button onClick={handleSend} className="send-btn">Send</button>
        </div>
      </footer>
    </div>
  );
}

export default App;
