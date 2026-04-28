"""
Run once before starting the server: python catalog.py

Loads data/products.json, embeds each product, creates the Pinecone index if
needed, and upserts all 40 vectors with full metadata.
"""

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer

load_dotenv()

PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
INDEX_NAME = os.environ["PINECONE_INDEX_NAME"]
DIMENSION = 384
PRODUCTS_PATH = Path(__file__).parent.parent / "data" / "products.json"

_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")


def _embed(text: str) -> list[float]:
    return _model.encode(text, normalize_embeddings=True).tolist()


def main() -> None:
    with open(PRODUCTS_PATH, encoding="utf-8") as f:
        products: list[dict] = json.load(f)

    pc = Pinecone(api_key=PINECONE_API_KEY)

    existing = [idx.name for idx in pc.list_indexes()]
    if INDEX_NAME not in existing:
        print(f"Creating index '{INDEX_NAME}'...")
        pc.create_index(
            name=INDEX_NAME,
            dimension=DIMENSION,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        # wait for index to be ready
        while not pc.describe_index(INDEX_NAME).status["ready"]:
            print("  Waiting for index to be ready...")
            time.sleep(3)
        print("  Index ready.")

    index = pc.Index(INDEX_NAME)

    vectors = []
    for p in products:
        embed_text = f"{p['name_en']} {p['doc_en']}"
        vector = {
            "id": str(p["id"]),
            "values": _embed(embed_text),
            "metadata": {
                "price_aed": float(p["price_aed"]),
                "price_usd": float(p["price_usd"]),
                "price_inr": float(p["price_inr"]),
                "min_age_months": int(p["min_age_months"]),
                "max_age_months": int(p["max_age_months"]),
                "tags": p["tags"],
                "occasion": p["occasion"],
                "category": p["category"],
                "name_en": p["name_en"],
                "name_ar": p["name_ar"],
                "doc_en": p["doc_en"],
                "doc_ar": p["doc_ar"],
            },
        }
        vectors.append(vector)

    # upsert in batches of 20
    batch_size = 20
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        index.upsert(vectors=batch)
        print(f"  Upserted {min(i + batch_size, len(vectors))}/{len(vectors)} products")

    print(f"Upserted {len(products)} products to Pinecone index {INDEX_NAME}")


if __name__ == "__main__":
    main()
