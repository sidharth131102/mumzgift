import json
import logging
import os
from pathlib import Path

from fastapi import HTTPException
from groq import AsyncGroq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

from schemas import GiftCard, GiftIntent, SearchResponse


def _parse_json(raw: str) -> dict:
    """Strip markdown fences if present, then parse JSON."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.environ["GROQ_API_KEY"]
PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
INDEX_NAME = os.environ["PINECONE_INDEX_NAME"]

INTENT_PROMPT = (Path(__file__).parent.parent / "prompts" / "intent_extractor.txt").read_text(encoding="utf-8")
RANKER_PROMPT = (Path(__file__).parent.parent / "prompts" / "ranker_system.txt").read_text(encoding="utf-8")

_embed_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
_pinecone = Pinecone(api_key=PINECONE_API_KEY)
_index = _pinecone.Index(INDEX_NAME)
_llm = AsyncGroq(api_key=GROQ_API_KEY)


# ── Stage 1 ──────────────────────────────────────────────────────────────────

async def extract_intent(query: str) -> GiftIntent:
    try:
        response = await _llm.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": INTENT_PROMPT},
                {"role": "user", "content": query},
            ],
            temperature=0.1,
            max_tokens=512,
        )
    except Exception as e:
        logger.error("LLM call failed during intent extraction: %s", e)
        raise HTTPException(status_code=500, detail=f"LLM error during intent extraction: {e}")

    raw = response.choices[0].message.content.strip()
    logger.debug("Intent LLM raw response: %s", raw)

    try:
        data = _parse_json(raw)
    except json.JSONDecodeError as e:
        logger.error("Intent LLM returned invalid JSON: %s", raw)
        raise HTTPException(
            status_code=500,
            detail=f"Intent extractor returned invalid JSON: {e}. Raw response: {raw[:300]}",
        )

    try:
        return GiftIntent(**data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


# ── Stage 2 ──────────────────────────────────────────────────────────────────

def embed_query(query: str) -> list[float]:
    return _embed_model.encode(query, normalize_embeddings=True).tolist()


# ── Stage 3 ──────────────────────────────────────────────────────────────────

async def retrieve_products(
    query_embedding: list[float],
    intent: GiftIntent,
    top_k: int = 8,
) -> list[dict]:
    filter_: dict = {}

    if intent.budget_aed is not None:
        filter_["price_aed"] = {"$lte": intent.budget_aed}

    if intent.baby_age_months is not None:
        filter_["min_age_months"] = {"$lte": intent.baby_age_months}
        filter_["max_age_months"] = {"$gte": intent.baby_age_months}

    kwargs: dict = {
        "vector": query_embedding,
        "top_k": top_k,
        "include_metadata": True,
    }
    if filter_:
        kwargs["filter"] = filter_

    try:
        result = _index.query(**kwargs)
    except Exception as e:
        logger.error("Pinecone query failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Vector DB query failed: {e}")

    products = []
    for match in result.matches:
        meta = match.metadata
        products.append(
            {
                "id": int(match.id),
                "score": match.score,
                **meta,
            }
        )

    logger.debug("Retrieved %d products from Pinecone", len(products))
    return products


# ── Stage 4 ──────────────────────────────────────────────────────────────────

async def rank_gifts(intent: GiftIntent, retrieved_products: list[dict]) -> SearchResponse:
    # 1. Out-of-scope: check BEFORE clarification so "gift for my dog"
    #    returns null rather than asking for a budget.
    if intent.confidence < 0.3 and intent.budget_aed is None and intent.baby_age_months is None:
        return SearchResponse(
            status="null",
            intent=intent,
            gifts=[],
            null_reason="This query appears to be outside the scope of Mumzworld. We specialise in gifts for babies and mothers.",
        )

    # 2. No products retrieved (budget/age filter returned nothing).
    if not retrieved_products:
        return SearchResponse(
            status="null",
            intent=intent,
            gifts=[],
            null_reason="No products found matching your budget and age requirements. Try adjusting your budget or age range.",
        )

    # 3. Missing budget — ask for clarification.
    if intent.missing_info and intent.budget_aed is None:
        q = "What is your budget? (you can answer in AED, USD, or INR)"
        if intent.baby_age_months is None and "baby_age_months" in intent.missing_info:
            q = "Could you share your budget (in AED, USD, or INR) and the baby's age in months?"
        return SearchResponse(
            status="clarification_needed",
            intent=intent,
            gifts=[],
            clarification_question=q,
        )

    docs_payload = []
    for p in retrieved_products:
        docs_payload.append(
            {
                "product_id": p["id"],
                "name_en": p.get("name_en", ""),
                "name_ar": p.get("name_ar", ""),
                "price_aed": p.get("price_aed", 0),
                "price_usd": p.get("price_usd", 0),
                "price_inr": p.get("price_inr", 0),
                "min_age_months": p.get("min_age_months", 0),
                "max_age_months": p.get("max_age_months", 0),
                "tags": p.get("tags", []),
                "occasion": p.get("occasion", []),
                "doc_en": p.get("doc_en", ""),
                "doc_ar": p.get("doc_ar", ""),
            }
        )

    user_msg = (
        f"Gift intent:\n{json.dumps(intent.model_dump(), ensure_ascii=False, indent=2)}\n\n"
        f"Retrieved products:\n{json.dumps(docs_payload, ensure_ascii=False, indent=2)}"
    )

    try:
        response = await _llm.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": RANKER_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=2048,
        )
    except Exception as e:
        logger.error("LLM call failed during ranking: %s", e)
        raise HTTPException(status_code=500, detail=f"LLM error during ranking: {e}")

    raw = response.choices[0].message.content.strip()
    logger.debug("Ranker LLM raw response: %s", raw)

    try:
        data = _parse_json(raw)
    except json.JSONDecodeError as e:
        logger.error("Ranker LLM returned invalid JSON: %s", raw)
        raise HTTPException(
            status_code=500,
            detail=f"Ranker returned invalid JSON: {e}. Raw response: {raw[:300]}",
        )

    if data.get("status") == "null":
        return SearchResponse(
            status="null",
            intent=intent,
            gifts=[],
            null_reason=data.get("null_reason", "No suitable products found."),
        )

    gift_cards: list[GiftCard] = []
    for card_data in data.get("gifts", []):
        try:
            gift_cards.append(GiftCard(**card_data))
        except Exception as e:
            raise HTTPException(
                status_code=422,
                detail=f"Gift card validation failed for product_id={card_data.get('product_id')}: {e}",
            )

    return SearchResponse(status="results", intent=intent, gifts=gift_cards)


# ── Full pipeline ─────────────────────────────────────────────────────────────

async def run_gift_finder(query: str) -> SearchResponse:
    logger.info("Pipeline start — query: %r", query)

    intent = await extract_intent(query)
    logger.info("Intent extracted: %s", intent.model_dump())

    embedding = embed_query(query)
    logger.debug("Query embedded (%d dims)", len(embedding))

    products = await retrieve_products(embedding, intent)
    logger.info("Retrieved %d products", len(products))

    response = await rank_gifts(intent, products)
    logger.info("Pipeline complete — status: %s, gifts: %d", response.status, len(response.gifts))

    return response


async def get_products_by_ids(product_ids: list[int]) -> list[dict]:
    """Fetch products from Pinecone by their IDs for the /compare endpoint."""
    try:
        result = _index.fetch(ids=[str(pid) for pid in product_ids])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector DB fetch failed: {e}")

    products = []
    for pid in product_ids:
        vec = result.vectors.get(str(pid))
        if vec and vec.metadata:
            products.append({"id": pid, **vec.metadata})

    return products
