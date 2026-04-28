import logging
import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from pipeline import get_products_by_ids, run_gift_finder
from schemas import (
    CompareRequest,
    CompareResponse,
    GiftCard,
    SearchRequest,
    SearchResponse,
    TranscribeResponse,
)
from whisper_stt import transcribe_audio

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Mumzgift API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", os.getenv("FRONTEND_URL", "")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/search", response_model=SearchResponse)
async def search(req: SearchRequest) -> SearchResponse:
    return await run_gift_finder(req.query)


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile) -> TranscribeResponse:
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")
    return await transcribe_audio(audio_bytes, audio.filename)


@app.post("/api/compare", response_model=CompareResponse)
async def compare(req: CompareRequest) -> CompareResponse:
    if not req.product_ids:
        raise HTTPException(status_code=400, detail="product_ids must not be empty")
    if len(req.product_ids) > 3:
        raise HTTPException(status_code=400, detail="Cannot compare more than 3 products")

    raw_products = await get_products_by_ids(req.product_ids)
    if not raw_products:
        raise HTTPException(status_code=404, detail="No products found for given IDs")

    gift_cards: list[GiftCard] = []
    for p in raw_products:
        min_m = int(p.get("min_age_months", 0))
        max_m = int(p.get("max_age_months", 0))
        age_range = f"{min_m}–{max_m} months"

        card = GiftCard(
            product_id=p["id"],
            name_en=p.get("name_en", ""),
            name_ar=p.get("name_ar", ""),
            price_aed=float(p.get("price_aed", 0)),
            price_usd=float(p.get("price_usd", 0)),
            price_inr=float(p.get("price_inr", 0)),
            age_range=age_range,
            reason_en=p.get("doc_en", "")[:200],
            reason_ar=p.get("doc_ar", "")[:200],
            confidence=1.0,
            grounded_in=p.get("doc_en", "")[:100],
            tags=p.get("tags", []),
            occasion=p.get("occasion", []),
        )
        gift_cards.append(card)

    best_value_id = min(gift_cards, key=lambda c: c.price_aed).product_id
    best_match_id = max(gift_cards, key=lambda c: c.confidence).product_id

    return CompareResponse(
        products=gift_cards,
        best_value_id=best_value_id,
        best_match_id=best_match_id,
    )
