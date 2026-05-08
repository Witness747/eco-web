import os
import re
import requests
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from groq import Groq
from dotenv import load_dotenv

import pytesseract
from PIL import Image, ImageEnhance, ImageOps
from pyzbar.pyzbar import decode
from io import BytesIO


# ================= ENV =================
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("Missing GROQ_API_KEY")

client = Groq(api_key=GROQ_API_KEY)


# ================= APP =================
app = FastAPI(title="EcoBot Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================= DB =================
def db():
    try:
        url = os.getenv("DATABASE_URL", "")
        # Strip channel_binding if Neon added it
        url = url.replace("&channel_binding=require", "").replace("?channel_binding=require", "")
        return psycopg2.connect(
            url,
            cursor_factory=RealDictCursor,
            sslmode="require"
        )
    except Exception as e:
        print("DB ERROR:", e)
        return None

# ================= OCR (Pre-processed) =================
def extract_text(image_bytes: bytes) -> str:
    """Greyscale + 1.5x contrast boost before Tesseract for better OCR on free tier."""
    try:
        img = Image.open(BytesIO(image_bytes))
        img = ImageOps.grayscale(img)
        img = ImageEnhance.Contrast(img).enhance(1.5)
        return pytesseract.image_to_string(img)
    except Exception as e:
        print("OCR ERROR:", e)
        return ""


# ================= EXPIRY =================
def find_expiry(text: str) -> str:
    patterns = [
        r"\b\d{2}/\d{2}/\d{2,4}\b",
        r"\b\d{2}-\d{2}-\d{2,4}\b",
        r"\bEXP[:\s]*\d{2}[/\-]\d{2}[/\-]\d{2,4}\b",
        r"\bBEST BEFORE[:\s]*\d{2}[/\-]\d{2}[/\-]\d{2,4}\b",
    ]
    for p in patterns:
        match = re.search(p, text, re.IGNORECASE)
        if match:
            return match.group()
    return "Not found"


def parse_expiry_date(expiry_text: str):
    clean = re.sub(r"[^0-9/\-]", "", expiry_text.split(":")[-1].strip())
    formats = ["%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%m/%d/%Y", "%m-%d-%Y"]
    for f in formats:
        try:
            return datetime.strptime(clean, f)
        except Exception:
            continue
    return None


def expiry_status(date) -> str:
    if not date:
        return "Unknown"
    now = datetime.utcnow()
    if date < now:
        return "Expired"
    elif (date - now).days < 5:
        return "Expiring Soon"
    else:
        return "Safe"


# ================= BARCODE =================
def extract_barcode(image_bytes: bytes):
    try:
        img = Image.open(BytesIO(image_bytes))
        codes = decode(img)
        if codes:
            return codes[0].data.decode("utf-8")
    except Exception:
        return None


def fetch_product(barcode: str):
    try:
        url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
        data = requests.get(url, timeout=5).json()
        if data.get("status") != 1:
            return None
        p = data["product"]
        name = p.get("product_name", "Unknown Product")
        brand = p.get("brands", "")

        # Build smarter search query using name + brand
        query = f"{brand} {name}".strip().replace(" ", "+")

        return {
            "name": name,
            "brand": brand,
            "eco": p.get("ecoscore_grade", "N/A"),
            "category": p.get("categories", ""),
            "barcode": barcode,
            "image": p.get("image_front_url", ""),        # product image from OpenFoodFacts
            "ingredients": p.get("ingredients_text", ""), # raw ingredients
            "nutriscore": p.get("nutriscore_grade", "N/A"),
            "links": {
                "openfoodfacts": f"https://world.openfoodfacts.org/product/{barcode}",
                "amazon": f"https://www.amazon.in/s?k={query}",
                "flipkart": f"https://www.flipkart.com/search?q={query}",
                "bigbasket": f"https://www.bigbasket.com/ps/?q={query}",  # India-relevant
                "blinkit": f"https://blinkit.com/s/?q={query}",           # India-relevant
            }
        }
    except Exception as e:
        print("FETCH_PRODUCT ERROR:", e)
        return None

# ================= ECO SCORE =================
def eco_score(product) -> int:
    if not product:
        return 0
    score = 0
    if product.get("eco") in ["a", "b"]:
        score += 5
    if "plastic" in str(product.get("category", "")).lower():
        score -= 2
    return score


# ================= STORAGE ADVICE =================
def storage_advice(product_name: str) -> str:
    name = (product_name or "").lower()
    if any(k in name for k in ["milk", "dairy", "curd", "paneer", "cheese"]):
        return "Keep refrigerated at 2–4°C. Use within 2 days of opening."
    if any(k in name for k in ["fruit", "vegetable", "salad"]):
        return "Store in fridge crisper drawer at 4–8°C. Avoid washing before storage."
    if "bread" in name or "roti" in name:
        return "Keep in a cool dry place (not fridge — it accelerates staling)."
    if any(k in name for k in ["meat", "fish", "chicken", "mutton"]):
        return "Refrigerate at 0–2°C. Freeze if not using within 24 hours."
    return "Store in a cool, dry place away from direct sunlight."


# ================= ADAPTIVE PERSONA =================
PERSONA_MAP = {
    "food": {
        "label": "Food Scientist",
        "system": (
            "You are Dr. EcoBot, a Food Scientist specializing in food safety, "
            "nutrition, and sustainable sourcing. Analyse the product with a focus on "
            "ingredients, expiry risk, nutritional impact, and eco-friendly alternatives. "
            "Always structure your response with: ## Product Understanding, "
            "## Safety Assessment, ## Eco Impact, ## Better Alternatives, ## Storage Tips."
        ),
    },
    "textile": {
        "label": "Textile Expert",
        "system": (
            "You are Dr. EcoBot, a Textile & Materials Expert. Focus on fabric composition, "
            "dye safety, microplastic shedding, and sustainable fabric alternatives. "
            "Structure: ## Material Analysis, ## Environmental Impact, ## Care Instructions, "
            "## Sustainable Swaps."
        ),
    },
    "electronics": {
        "label": "Material Engineer",
        "system": (
            "You are Dr. EcoBot, a Material Engineer specialising in e-waste and circular economy. "
            "Focus on component materials, repairability, recycling options, and energy efficiency. "
            "Structure: ## Device Overview, ## Environmental Footprint, ## Disposal & Recycling, "
            "## Greener Alternatives."
        ),
    },
    "default": {
        "label": "Eco Analyst",
        "system": (
            "You are EcoBot, an AI Environmental Analyst. Analyse the product's environmental "
            "impact, safety, and suggest better alternatives. "
            "Structure: ## Product Understanding, ## Safety, ## Eco Impact, ## Better Alternatives."
        ),
    },
}


def detect_persona(product) -> dict:
    if not product:
        return PERSONA_MAP["default"]
    category = str(product.get("category", "")).lower()
    name = str(product.get("name", "")).lower()
    combined = category + " " + name
    if any(k in combined for k in ["food", "drink", "beverage", "milk", "snack", "fruit", "meat", "vegetable"]):
        return PERSONA_MAP["food"]
    if any(k in combined for k in ["cloth", "shirt", "jean", "fabric", "textile", "apparel", "wear"]):
        return PERSONA_MAP["textile"]
    if any(k in combined for k in ["electronic", "phone", "laptop", "charger", "battery", "gadget"]):
        return PERSONA_MAP["electronics"]
    return PERSONA_MAP["default"]


# ================= AI ANALYSIS =================
def ai_analysis(text: str, expiry: str, product) -> tuple[str, str]:
    persona = detect_persona(product)
    product_name = product.get("name", "Unknown") if product else "Unknown"

    prompt = f"""
OCR TEXT FROM LABEL:
{text or "(no OCR text extracted)"}

Expiry Detected: {expiry}
Product Name: {product_name}

Provide a thorough analysis as instructed.
"""
    res = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": persona["system"]},
            {"role": "user", "content": prompt},
        ],
    )
    return res.choices[0].message.content, persona["label"]


# ================= CHAT =================
class Chat(BaseModel):
    message: str


@app.post("/api/chat")
async def chat(req: Chat):
    res = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are EcoBot, an AI assistant specialising in sustainability, "
                    "eco-friendly living, product safety, and green alternatives. "
                    "Be concise, warm, and use Markdown formatting."
                ),
            },
            {"role": "user", "content": req.message},
        ],
    )
    reply = res.choices[0].message.content

    conn = db()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO chat_history(role,content,is_deleted,created_at) VALUES(%s,%s,%s,%s)",
                    ("user", req.message, False, datetime.utcnow()),
                )
                cur.execute(
                    "INSERT INTO chat_history(role,content,is_deleted,created_at) VALUES(%s,%s,%s,%s)",
                    ("assistant", reply, False, datetime.utcnow()),
                )
                conn.commit()
        finally:
            conn.close()

    return {
        "reply": reply,
        "persona": "Eco Analyst",
        "product_card": None,
    }


# ================= SCAN / ANALYZE =================
@app.post("/api/analyze-product")
async def analyze(file: UploadFile = File(...)):
    image = await file.read()

    text = extract_text(image)
    exp_text = find_expiry(text)
    exp_date = parse_expiry_date(exp_text)
    exp_status = expiry_status(exp_date)

    barcode = extract_barcode(image)
    product = fetch_product(barcode) if barcode else None

    eco = eco_score(product)
    store = storage_advice(product.get("name") if product else "")
    analysis, persona_label = ai_analysis(text, exp_text, product)

    product_card = None
    if product:
        product_card = {
            "name":        product.get("name", "Unknown Product"),
            "brand":       product.get("brand", ""),
            "eco_score":   product.get("eco", "N/A"),
            "eco_points":  eco,
            "barcode":     product.get("barcode", ""),
            "image":       product.get("image", ""),
            "nutriscore":  product.get("nutriscore", "N/A"),
            "ingredients": product.get("ingredients", ""),
            "links":       product.get("links", {}),
        }
    return {
        "reply": analysis,
        "persona": persona_label,
        "product_card": product_card,
        "expiry": exp_status,
        "storage": store,
    }


# ================= HISTORY =================
@app.get("/api/history")
async def history():
    conn = db()
    if not conn:
        raise HTTPException(500, "DB error")
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, role, content FROM chat_history WHERE is_deleted=FALSE ORDER BY created_at ASC"
            )
            return cur.fetchall()
    finally:
        conn.close()


# ================= TRASH =================
@app.get("/api/trash")
async def trash():
    conn = db()
    if not conn:
        raise HTTPException(500, "DB error")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, role, content FROM chat_history WHERE is_deleted=TRUE")
            return cur.fetchall()
    finally:
        conn.close()


@app.delete("/api/chat/{id}")
async def delete(id: int):
    conn = db()
    if not conn:
        raise HTTPException(500, "DB error")
    with conn.cursor() as cur:
        cur.execute("UPDATE chat_history SET is_deleted=TRUE WHERE id=%s", (id,))
        conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/recover/{id}")
async def recover(id: int):
    conn = db()
    if not conn:
        raise HTTPException(500, "DB error")
    with conn.cursor() as cur:
        cur.execute("UPDATE chat_history SET is_deleted=FALSE WHERE id=%s", (id,))
        conn.commit()
    conn.close()
    return {"ok": True}


# ================= REVOLUTION PROTOCOL — PURGE =================
@app.delete("/api/purge")
async def purge():
    """Hard-marks ALL non-deleted messages as deleted, resetting the AI Pulse."""
    conn = db()
    if not conn:
        raise HTTPException(500, "DB error")
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE chat_history SET is_deleted=TRUE WHERE is_deleted=FALSE"
            )
            conn.commit()
    finally:
        conn.close()
    return {"ok": True, "message": "Session purged. Pulse reset."}


# ================= STATUS =================
@app.get("/api/status")
async def status():
    return {"status": "online", "service": "EcoBot Engine"}
# ================= SHOPPING GALLERY =================

SHOPPING_GALLERY = [
    {
        "id": 1,
        "name": "Patagonia",
        "category": "clothing",
        "description": "Recycled & environmentally-friendly outdoor clothing",
        "eco_grade": "A+",
        "icon": "👕",
        "url": "https://www.patagonia.com",
    },
    {
        "id": 2,
        "name": "Reformation",
        "category": "clothing",
        "description": "Fashionable clothing with sustainability transparency",
        "eco_grade": "A",
        "icon": "👗",
        "url": "https://www.thereformation.com",
    },
    {
        "id": 3,
        "name": "People Tree",
        "category": "clothing",
        "description": "Fair trade organic cotton clothing",
        "eco_grade": "A",
        "icon": "🧵",
        "url": "https://www.peopletree.co.uk",
    },
    {
        "id": 4,
        "name": "Bambooee",
        "category": "home",
        "description": "Reusable bamboo products for kitchen & cleaning",
        "eco_grade": "A+",
        "icon": "🎋",
        "url": "https://www.bambooee.com",
    },
    {
        "id": 5,
        "name": "West Elm",
        "category": "home",
        "description": "Sustainable home decor & furniture",
        "eco_grade": "B",
        "icon": "🏠",
        "url": "https://www.westelm.com",
    },
    {
        "id": 6,
        "name": "Seventh Generation",
        "category": "home",
        "description": "Eco-friendly household cleaning products",
        "eco_grade": "A",
        "icon": "🧹",
        "url": "https://www.seventhgeneration.com",
    },
    {
        "id": 7,
        "name": "Dr. Bronner's",
        "category": "care",
        "description": "Organic & fair trade personal care products",
        "eco_grade": "A+",
        "icon": "🧴",
        "url": "https://www.drbronner.com",
    },
    {
        "id": 8,
        "name": "Burt's Bees",
        "category": "care",
        "description": "Natural beeswax & essential oil personal care",
        "eco_grade": "A",
        "icon": "🐝",
        "url": "https://www.burtsbees.com",
    },
    {
        "id": 9,
        "name": "SheaMoisture",
        "category": "care",
        "description": "Natural organic coconut oil personal care",
        "eco_grade": "A",
        "icon": "🌿",
        "url": "https://www.sheamoisture.com",
    },
    {
        "id": 10,
        "name": "Lush",
        "category": "beauty",
        "description": "Handmade beauty from natural ingredients",
        "eco_grade": "A",
        "icon": "💆",
        "url": "https://www.lush.com",
    },
    {
        "id": 11,
        "name": "Juice Beauty",
        "category": "beauty",
        "description": "Organic beauty from sustainable grapes",
        "eco_grade": "A",
        "icon": "🌸",
        "url": "https://www.juicebeauty.com",
    },
    {
        "id": 12,
        "name": "Acure",
        "category": "beauty",
        "description": "Sustainable beauty from argan stem cells",
        "eco_grade": "A",
        "icon": "✨",
        "url": "https://www.acureorganics.com",
    },
    {
        "id": 13,
        "name": "Thrive Market",
        "category": "grocery",
        "description": "Online sustainable & eco-friendly grocery",
        "eco_grade": "A",
        "icon": "🛒",
        "url": "https://www.thrivemarket.com",
    },
    {
        "id": 14,
        "name": "Local Harvest",
        "category": "grocery",
        "description": "Local farmers markets & sustainable food",
        "eco_grade": "A+",
        "icon": "🌾",
        "url": "https://www.localharvest.org",
    },
    {
        "id": 15,
        "name": "Full Harvest",
        "category": "grocery",
        "description": "Surplus produce from local farms",
        "eco_grade": "A+",
        "icon": "🥦",
        "url": "https://www.fullharvest.com",
    },
]


@app.get("/api/shopping-gallery")
async def shopping_gallery(category: str = None):
    """Return eco-friendly shopping brands, optionally filtered by category."""
    if category and category != "all":
        filtered = [p for p in SHOPPING_GALLERY if p["category"] == category]
    else:
        filtered = SHOPPING_GALLERY
    return {
        "total": len(filtered),
        "category": category or "all",
        "products": filtered,
    }
