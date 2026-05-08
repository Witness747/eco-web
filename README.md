# 🌿 EcoBot — AI Sustainability Assistant

EcoBot is a full-stack AI app that helps users make eco-friendly product decisions.

## 🚀 Live Simulation
- **Dashboard:** [eco-web-self.vercel.app](https://eco-web-self.vercel.app)

## Features
- 💬 AI chat powered by Groq (LLaMA 3.1)
- 📸 Product label & barcode scanning (OCR + OpenFoodFacts)
- 🛍 Eco-friendly shopping gallery
- 🗂 Chat history with trash & restore
- 🌙 Dark/light mode

## Tech Stack
| Layer    | Technology |
|----------|-----------|
| Frontend | React + Vite → Vercel |
| Backend  | FastAPI + Python → Railway |
| Database | PostgreSQL (Neon) |
| AI       | Groq API (LLaMA 3.1 8B) |
| OCR      | Tesseract + pytesseract |
| Barcode  | pyzbar + OpenFoodFacts API |

## Architecture
Frontend (Vercel) → FastAPI (Railway) → Neon DB
                                      → Groq AI
                                      → OpenFoodFacts API
                                      → Tesseract OCR

## ⚙️ Local Development (WSL/Ubuntu 24)

### Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

### Frontend
cd frontend
npm install
npm run dev

## Environment Variables
### Backend (Railway)
DATABASE_URL=postgresql://...
GROQ_API_KEY=...

### Frontend (Vercel)
VITE_API_URL=https://eco-web-production.up.railway.app
