import os
from datetime import datetime, timedelta
from typing import Optional, List

import psycopg2
from psycopg2.extras import RealDictCursor

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from groq import Groq
from dotenv import load_dotenv


# =========================
# ENV SETUP
# =========================
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY missing in .env")

client = Groq(api_key=GROQ_API_KEY)


# =========================
# APP INIT
# =========================
app = FastAPI(title="EcoBot Intelligence Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# MEMORY STATE (runtime layer)
# =========================
memory_state = {
    "persona": "Initializing eco-awareness...",
    "eco_keywords": [],
    "eco_score": 0
}


# =========================
# DB CONNECTION
# =========================
def db():
    if not DATABASE_URL:
        return None
    try:
        return psycopg2.connect(
            DATABASE_URL,
            cursor_factory=RealDictCursor,
            sslmode="require"
        )
    except Exception as e:
        print("DB ERROR:", e)
        return None


# =========================
# ECO INTELLIGENCE ENGINE
# =========================
def update_ecosystem(message: str):
    msg = message.lower()

    eco_triggers = {
        "plastic": 2,
        "waste": 2,
        "recycle": 3,
        "carbon": 3,
        "sustainability": 4,
        "eco": 2,
        "trash": 3
    }

    score = 0
    found = []

    for k, v in eco_triggers.items():
        if k in msg:
            found.append(k)
            score += v

    if found:
        memory_state["eco_keywords"].extend(found)
        memory_state["eco_keywords"] = list(set(memory_state["eco_keywords"]))
        memory_state["eco_score"] += score

    memory_state["persona"] = (
        f"Eco-aware user | Interests: {', '.join(memory_state['eco_keywords'])} | Score: {memory_state['eco_score']}"
    )


# =========================
# PROMPT ENGINE
# =========================
def build_prompt(user_message: str):
    return f"""
You are EcoBot, a sustainable shopping and eco-awareness assistant.

User Profile:
{memory_state['persona']}

Rules:
- Be conversational
- Suggest eco-friendly alternatives
- Focus on sustainability impact
- Keep responses structured and helpful

User Input:
{user_message}
"""


# =========================
# GROQ CALL
# =========================
def generate_ai_response(message: str):
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": build_prompt(message)},
                {"role": "user", "content": message}
            ],
            temperature=0.7
        )

        return response.choices[0].message.content

    except Exception as e:
        print("GROQ ERROR:", e)
        return None


# =========================
# REQUEST MODEL
# =========================
class ChatRequest(BaseModel):
    message: str


# =========================
# CHAT ENDPOINT
# =========================
@app.post("/api/chat")
async def chat(req: ChatRequest):
    update_ecosystem(req.message)

    reply = generate_ai_response(req.message)

    if not reply:
        raise HTTPException(status_code=500, detail="AI failure")

    conn = db()

    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chat_history 
                    (role, message, is_deleted, created_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    ("user", req.message, False, datetime.utcnow())
                )

                cur.execute(
                    """
                    INSERT INTO chat_history 
                    (role, message, is_deleted, created_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    ("assistant", reply, False, datetime.utcnow())
                )

                conn.commit()

        finally:
            conn.close()

    return {
        "reply": reply,
        "persona": memory_state["persona"],
        "eco_score": memory_state["eco_score"]
    }


# =========================
# SOFT DELETE (TRASH LOGIC)
# =========================
@app.delete("/api/chat/{chat_id}")
async def delete_chat(chat_id: int):
    conn = db()
    if not conn:
        raise HTTPException(status_code=500, detail="DB not connected")

    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE chat_history SET is_deleted = TRUE, deleted_at = %s WHERE id = %s",
                (datetime.utcnow(), chat_id)
            )
            conn.commit()
    finally:
        conn.close()

    return {"status": "moved_to_trash", "retention_days": 30}


# =========================
# RECOVERY (TRASH RESTORE)
# =========================
@app.post("/api/recover/{chat_id}")
async def recover_chat(chat_id: int):
    conn = db()
    if not conn:
        raise HTTPException(status_code=500, detail="DB not connected")

    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE chat_history SET is_deleted = FALSE, deleted_at = NULL WHERE id = %s",
                (chat_id,)
            )
            conn.commit()
    finally:
        conn.close()

    return {"status": "recovered"}


# =========================
# STATUS
# =========================
@app.get("/api/status")
async def status():
    return {
        "status": "online",
        "engine": "groq-llama-3.1",
        "eco_system": memory_state
    }


# =========================
# CLEANUP LOGIC (conceptual hook)
# =========================
def cleanup_old_messages():
    """
    Future cron job:
    DELETE FROM chat_history
    WHERE is_deleted = TRUE
    AND deleted_at < NOW() - INTERVAL '30 days'
    """
    pass


# =========================
# RUN
# =========================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
