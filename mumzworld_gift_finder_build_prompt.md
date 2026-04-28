# Mumzworld AI Gift Finder — Complete Build Prompt

> Hand this document to an AI coding agent (Claude Code, Cursor, Kilocode, etc.) or use it as your own step-by-step build guide. Every decision, constraint, file, schema, prompt, and eval case is specified here. Follow the order exactly — later files depend on earlier ones.

---

## 0. Context and goal

You are building **Mumzworld AI Gift Finder** — a production-quality AI prototype for a take-home assessment for Mumzworld's AI Engineering Intern role.

Mumzworld is the largest mother-and-baby e-commerce platform in the Middle East, serving millions of families across the GCC in English and Arabic.

The system takes a natural-language gift query (typed or spoken, in English or Arabic), retrieves semantically relevant products from a vector database, ranks them using an LLM, and returns structured bilingual gift recommendations with grounded reasoning.

**This is a graded submission.** Every architectural decision must be defensible. Every failure must be named. Every output must be grounded in the input. The system must say "I don't know" when it doesn't know.

---

## 1. Grading rubric — optimise against this

| Criterion | Weight | What earns full marks |
|---|---|---|
| Output quality + runs | 30% | Pydantic validation on every response, explicit errors, grounded output |
| Eval rigor | 25% | 15 test cases written before pipeline, named failure modes, honest scores |
| Problem selection | 20% | Real pain point, non-trivial AI stack, multilingual requirement natural |
| Uncertainty handling | 15% | null + explanation on impossible queries, clarification on missing info |
| Code clarity + tooling | 10% | Typed end-to-end, committed prompts, honest Tooling section in README |

---

## 2. What "good" looks like — non-negotiable

- **Output is grounded.** The model only recommends products that appear in the retrieved chunks. Every `GiftCard` has a `grounded_in` field containing the exact source chunk. A Pydantic `field_validator` rejects empty `grounded_in` at the schema level — hallucinated products cannot pass validation.
- **Multilingual output reads as native copy.** Arabic output is written as a native Gulf Arabic speaker would write it — not a structural translation of the English. The LLM prompt explicitly instructs this. An eval case checks for it.
- **Schema failures are explicit, never silent.** Pydantic `ValidationError` returns a `422` with field-level detail. No `try/except` that swallows errors and returns empty strings or `{}`.
- **Evals exist before the pipeline is written.** `test_cases.json` is the first file created. The pipeline is written to pass the cases — not the other way around.
- **Uncertainty is expressed, not hidden.** If budget is missing, `missing_info` is populated and a clarification is returned. If no products match, `null` is returned with an explanation. The system never guesses a budget from vague language like "affordable".

## 3. What "bad" looks like — never do these

- Returning a product not present in the retrieved Pinecone chunks
- Filling `grounded_in`, `reason_ar`, or `reason_en` with empty strings to pass validation
- Arabic output that mirrors English sentence structure word-for-word
- Inferring `budget = 100` from "something affordable" — this must trigger `missing_info`
- Returning confident results for out-of-scope queries like "gift for my dog"
- A `try/except` that catches `ValidationError` and returns an empty response
- Any field set to a placeholder like `"N/A"`, `"unknown"`, or `""`

---

## 4. Tech stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui | Production-quality UI, typed end-to-end |
| Backend | FastAPI, Python 3.11, async, Pydantic v2 | Fast, typed, async-native |
| Vector DB | Pinecone free tier (serverless) | Hosted, no local setup, metadata filtering |
| Embeddings | `paraphrase-multilingual-MiniLM-L12-v2` (sentence-transformers) | Free, local, handles EN + AR natively |
| LLM (runtime) | Qwen2.5-72B-Instruct via OpenRouter (free tier) | Best free model for Arabic structured JSON output |
| Voice STT | Groq Whisper large-v3 (free tier) / local Whisper fallback | Hosted, fast, Gulf Arabic support, returns detected language |

### Environment variables

```bash
# backend/.env
PINECONE_API_KEY=          # pinecone.io → free account → API Keys
PINECONE_INDEX_NAME=       # e.g. mumzworld-gifts (create before running)
OPENROUTER_API_KEY=        # openrouter.ai → free account → Keys
GROQ_API_KEY=              # console.groq.com → free account → API Keys
USE_GROQ=false             # set to true on deployed server

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 5. Complete project structure

```
mumzworld-gift-finder/
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # main page — state, layout, API wiring
│   │   ├── layout.tsx                # root layout, fonts, metadata
│   │   └── globals.css
│   ├── components/
│   │   ├── SearchBar.tsx             # text input + voice recorder + quick-fill chips
│   │   ├── IntentStrip.tsx           # parsed intent pills (budget, age, occasion)
│   │   ├── ProductCard.tsx           # bilingual card, confidence bar, select toggle
│   │   ├── ProductGrid.tsx           # responsive grid wrapper
│   │   ├── CompareTable.tsx          # side-by-side comparison, best-value highlights
│   │   ├── NullState.tsx             # graceful refusal with explanation message
│   │   └── ClarifyPrompt.tsx         # displays missing_info questions to the user
│   ├── lib/
│   │   └── api.ts                    # typed fetch wrappers for all 3 endpoints
│   ├── types/
│   │   └── index.ts                  # TypeScript types mirroring Pydantic schemas exactly
│   ├── package.json
│   └── tailwind.config.ts
│
├── backend/
│   ├── main.py                       # FastAPI app, 3 routes, CORS
│   ├── schemas.py                    # ALL Pydantic models
│   ├── pipeline.py                   # intent extraction + embed + Pinecone + LLM ranker
│   ├── catalog.py                    # generates mock products, embeds, upserts to Pinecone
│   ├── whisper_stt.py                # audio → transcript, USE_GROQ flag
│   ├── requirements.txt
│   └── evals/
│       ├── test_cases.json           # 15 test cases — WRITTEN FIRST before pipeline
│       └── evals.py                  # runs all cases, prints named pass/fail table
│
├── prompts/
│   ├── intent_extractor.txt          # committed system prompt for intent extraction
│   └── ranker_system.txt             # committed system prompt for gift ranker
│
├── data/
│   └── products.json                 # 40 mock products with rich bilingual doc strings
│
├── .env.example                      # all keys listed with source comments
└── README.md                         # Setup · Architecture · Evals · Tradeoffs · Tooling
```

---

## 6. Build order — follow this exactly

**Rule: write `test_cases.json` before any pipeline code. The pipeline is written to pass the cases, not the other way around.**

```
Step 1   data/products.json           generate 40 mock products
Step 2   backend/evals/test_cases.json  define all 15 eval cases FIRST
Step 3   backend/schemas.py           all Pydantic models
Step 4   prompts/intent_extractor.txt  intent extraction system prompt
Step 5   prompts/ranker_system.txt     ranker system prompt
Step 6   backend/catalog.py           embed + upsert products to Pinecone
Step 7   backend/pipeline.py          full RAG pipeline
Step 8   backend/whisper_stt.py       STT with USE_GROQ flag
Step 9   backend/main.py              FastAPI routes
Step 10  frontend/types/index.ts      TypeScript types
Step 11  frontend/lib/api.ts          typed fetch wrappers
Step 12  frontend/components/*        all UI components
Step 13  frontend/app/page.tsx        wire everything together
Step 14  backend/evals/evals.py       eval runner
Step 15  README.md                    all 4 required sections
Step 16  .env.example                 all keys documented
```

---

## 7. Data — products.json

Generate **40 mock products** in `data/products.json`. Do not scrape any website. Generate this data synthetically.

Each product must have:

```json
{
  "id": 1,
  "name_en": "Fisher-Price Soothe & Snuggle Otter",
  "name_ar": "فيشر-برايس أوتر للتهدئة والمراقدة",
  "price_aed": 149.0,
  "min_age_months": 0,
  "max_age_months": 6,
  "tags": ["soothing", "plush", "newborn", "sleep"],
  "occasion": ["newborn", "baby shower"],
  "category": "sleep-and-soothing",
  "doc_en": "The Fisher-Price Soothe & Snuggle Otter plays gentle heartbeat sounds and mimics breathing motions to calm babies. Recommended for newborns 0–6 months. Parents describe it as a lifesaver for colicky nights. Soft plush, no small parts, machine washable. Widely recommended by GCC paediatricians for sleep training. 149 AED.",
  "doc_ar": "يُصدر فيشر-برايس أوتر للتهدئة أصواتاً تشبه دقات القلب وحركات التنفس لتهدئة الرضع. مناسب للمواليد من 0 إلى 6 أشهر. تصفه كثير من الأمهات بأنه منقذ في ليالي المغص. ناعم وآمن وقابل للغسل في الغسالة."
}
```

Categories to cover across 40 products:
- `sleep-and-soothing` (5 products)
- `feeding` (5 products)
- `educational-toys` (6 products)
- `musical-toys` (4 products)
- `books` (4 products)
- `gear-and-activity` (5 products)
- `bath-and-skincare` (4 products)
- `clothing` (4 products)
- `safety` (3 products)

Price range: 35 AED to 650 AED. Ensure at least 8 products under 100 AED, 15 products 100–250 AED, and the rest above 250 AED. This ensures budget edge cases are testable.

---

## 8. Pydantic schemas — schemas.py

```python
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, Literal
from enum import Enum

class Language(str, Enum):
    EN = "en"
    AR = "ar"

class GiftIntent(BaseModel):
    budget_aed: Optional[float] = None       # null if not stated or inferable
    baby_age_months: Optional[int] = None    # null if not stated
    occasion: Optional[str] = None           # "newborn", "baby shower", "birthday", etc.
    tags: list[str] = []                     # inferred from query: soothing, educational, etc.
    language: Language = Language.EN         # detected from query text
    confidence: float                        # 0.0–1.0 — how confident the extraction is
    missing_info: list[str] = []             # fields that couldn't be inferred

    @field_validator("confidence")
    @classmethod
    def confidence_in_range(cls, v):
        if not 0.0 <= v <= 1.0:
            raise ValueError("confidence must be between 0.0 and 1.0")
        return v

class GiftCard(BaseModel):
    product_id: int
    name_en: str
    name_ar: str
    price_aed: float
    age_range: str                           # human-readable e.g. "0–6 months"
    reason_en: str                           # why this fits — native English copy
    reason_ar: str                           # why this fits — native Gulf Arabic copy, NOT a translation
    confidence: float                        # 0.0–1.0
    grounded_in: str                         # exact chunk from retrieved product doc — NEVER empty
    tags: list[str]
    occasion: list[str]

    @field_validator("grounded_in")
    @classmethod
    def grounded_in_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError(
                "grounded_in cannot be empty. "
                "Every recommendation must cite the source product document chunk."
            )
        return v

    @field_validator("reason_ar")
    @classmethod
    def reason_ar_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("reason_ar cannot be empty — Arabic reason is required")
        return v

    @field_validator("reason_en")
    @classmethod
    def reason_en_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("reason_en cannot be empty — English reason is required")
        return v

class SearchResponse(BaseModel):
    status: Literal["results", "null", "clarification_needed"]
    intent: GiftIntent
    gifts: list[GiftCard] = []              # empty if status is null or clarification_needed
    null_reason: Optional[str] = None       # populated when status == "null"
    clarification_question: Optional[str] = None  # populated when status == "clarification_needed"

class CompareResponse(BaseModel):
    products: list[GiftCard]
    best_value_id: int                       # product_id of lowest price among selected
    best_match_id: int                       # product_id of highest confidence among selected

class TranscribeResponse(BaseModel):
    transcript: str
    language: Language                       # detected by Whisper
    confidence: Optional[float] = None
```

---

## 9. Prompts — write these before pipeline.py

### prompts/intent_extractor.txt

```
You are an intent extraction model for Mumzworld, a baby and mother e-commerce platform in the GCC.

Your job is to extract structured intent from a natural-language gift query. The query may be in English or Arabic.

Extract the following fields:
- budget_aed: a number if mentioned or clearly implied. Set to null if not stated. NEVER infer a number from words like "affordable", "cheap", or "reasonable" — these must result in null.
- baby_age_months: integer months if mentioned. Set to null if not stated. Convert years to months (e.g. "1 year" = 12).
- occasion: one of ["newborn", "baby shower", "birthday", "eid", "general"] or null.
- tags: list of relevant descriptors inferred from the query. Examples: ["soothing", "educational", "musical", "wooden", "books", "feeding", "safety"].
- language: "ar" if the query is in Arabic, "en" otherwise.
- confidence: float 0.0–1.0 representing how confident you are in the extraction.
- missing_info: list of field names that could not be inferred. If budget_aed is null, include "budget_aed". If baby_age_months is null, include "baby_age_months".

Rules:
- Return ONLY valid JSON matching the schema. No explanation, no markdown, no preamble.
- If the query is entirely out of scope (e.g. about pets, adults, non-baby products), set confidence to 0.1 and include all fields as null with missing_info = ["budget_aed", "baby_age_months", "occasion"].
- Do not invent information not present in the query.

Output format:
{
  "budget_aed": null or number,
  "baby_age_months": null or integer,
  "occasion": null or string,
  "tags": [],
  "language": "en" or "ar",
  "confidence": float,
  "missing_info": []
}
```

### prompts/ranker_system.txt

```
You are a gift recommendation model for Mumzworld, a baby and mother e-commerce platform in the GCC.

You will be given:
1. A structured gift intent (budget, age, occasion, tags, language)
2. A list of retrieved product documents from the Mumzworld catalog

Your job is to select the 3 most relevant products and return structured gift cards.

Rules:
- ONLY recommend products that appear in the provided retrieved documents. Do not invent products.
- Every gift card MUST include a grounded_in field containing a direct quote (15–50 words) from the product document that justifies the recommendation.
- reason_en must be written as natural, warm English copy — as a knowledgeable parent advisor would write it.
- reason_ar must be written as a native Gulf Arabic speaker would write it — NOT a word-for-word translation of the English. Use natural Gulf Arabic phrasing and sentence structure.
- confidence must reflect how well the product matches the intent. If the product is a partial match, set confidence below 0.7.
- If no retrieved products are within budget, return an empty gifts array and set status to "null".
- If fewer than 3 products match, return only the matching ones. Do not pad with poor matches.
- If budget_aed is null, recommend across price ranges but note prices clearly.

Return ONLY valid JSON. No explanation, no markdown, no preamble.

Output format:
{
  "status": "results" or "null",
  "null_reason": null or string explaining why no results were returned,
  "gifts": [
    {
      "product_id": integer,
      "name_en": string,
      "name_ar": string,
      "price_aed": float,
      "age_range": string,
      "reason_en": string,
      "reason_ar": string,
      "confidence": float,
      "grounded_in": string (exact quote from product doc),
      "tags": [],
      "occasion": []
    }
  ]
}
```

---

## 10. Pipeline — pipeline.py

The pipeline has four stages. Implement each as a separate function.

### Stage 1 — Intent extraction
```python
async def extract_intent(query: str) -> GiftIntent:
    """
    Calls the LLM (Qwen2.5-72B via OpenRouter) with the intent_extractor prompt.
    Parses the JSON response and validates against GiftIntent schema.
    On ValidationError: raises HTTPException 422 with field-level detail.
    On LLM JSON parse failure: raises HTTPException 500 with raw response in detail.
    Never returns a partially-filled GiftIntent with empty fields.
    """
```

### Stage 2 — Query embedding
```python
def embed_query(query: str) -> list[float]:
    """
    Embeds the query using paraphrase-multilingual-MiniLM-L12-v2.
    Model is loaded once at startup and reused (not reloaded per request).
    Returns a list of floats (384 dimensions).
    """
```

### Stage 3 — Pinecone retrieval
```python
async def retrieve_products(
    query_embedding: list[float],
    intent: GiftIntent,
    top_k: int = 8
) -> list[dict]:
    """
    Queries Pinecone with the embedded query.
    Applies metadata pre-filters:
      - If budget_aed is not null: filter price_aed <= budget_aed
      - If baby_age_months is not null: filter min_age_months <= baby_age_months <= max_age_months
    Returns list of product dicts including their doc_en and doc_ar fields.
    If 0 results after filtering: returns empty list (pipeline handles this as null state).
    """
```

### Stage 4 — LLM gift ranking
```python
async def rank_gifts(
    intent: GiftIntent,
    retrieved_products: list[dict]
) -> SearchResponse:
    """
    If retrieved_products is empty:
      Returns SearchResponse(
        status="null",
        intent=intent,
        gifts=[],
        null_reason="No products found matching your budget and age requirements."
      )

    If intent.missing_info is non-empty and budget_aed is None:
      Returns SearchResponse(
        status="clarification_needed",
        intent=intent,
        gifts=[],
        clarification_question="What is your budget in AED?"
      )

    Otherwise:
      Calls LLM with ranker_system prompt + intent + retrieved product docs.
      Parses JSON response.
      Validates each gift card against GiftCard schema.
      On ValidationError: raises HTTPException 422 — never returns malformed cards.
      Returns SearchResponse(status="results", intent=intent, gifts=[...])
    """
```

### Full pipeline function
```python
async def run_gift_finder(query: str) -> SearchResponse:
    """
    Orchestrates all four stages in order.
    Logs each stage result for debugging.
    Propagates exceptions — never silently swallows errors.
    """
    intent = await extract_intent(query)
    embedding = embed_query(query)
    products = await retrieve_products(embedding, intent)
    response = await rank_gifts(intent, products)
    return response
```

---

## 11. Whisper STT — whisper_stt.py

```python
import os
import tempfile
from pathlib import Path

USE_GROQ = os.getenv("USE_GROQ", "false").lower() == "true"

async def transcribe_audio(audio_bytes: bytes, filename: str) -> TranscribeResponse:
    """
    Saves audio bytes to a temp file, transcribes with Groq or local Whisper.
    Returns TranscribeResponse with transcript and detected language.
    Supported formats: wav, mp3, mp4, webm, ogg.
    On transcription failure: raises HTTPException 500 with error detail.
    """
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        if USE_GROQ:
            return await _transcribe_groq(tmp_path)
        else:
            return _transcribe_local(tmp_path)
    finally:
        os.unlink(tmp_path)  # always clean up temp file

def _transcribe_local(path: str) -> TranscribeResponse:
    """Uses openai-whisper pip package. Model loaded once at startup."""
    import whisper
    model = whisper.load_model("base")
    result = model.transcribe(path)
    return TranscribeResponse(
        transcript=result["text"].strip(),
        language=Language(result["language"]) if result["language"] in ("en", "ar") else Language.EN
    )

async def _transcribe_groq(path: str) -> TranscribeResponse:
    """Uses Groq Whisper large-v3 API."""
    from groq import Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    with open(path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=f,
            model="whisper-large-v3",
            response_format="verbose_json"
        )
    return TranscribeResponse(
        transcript=result.text.strip(),
        language=Language(result.language) if result.language in ("en", "ar") else Language.EN
    )
```

---

## 12. FastAPI routes — main.py

Three endpoints only. No extra routes.

```python
# POST /api/search
# Body: { "query": str, "language": "en" | "ar" }
# Returns: SearchResponse
# On error: 422 with field-level Pydantic detail, or 500 with error message

# POST /api/transcribe
# Body: multipart/form-data, field "audio" = audio file
# Returns: TranscribeResponse
# On error: 500 with error message

# POST /api/compare
# Body: { "product_ids": list[int] }
# Returns: CompareResponse
# Products fetched from Pinecone by ID. best_value_id = lowest price. best_match_id = highest confidence.
```

CORS must allow `http://localhost:3000` in development.

---

## 13. Catalog seeding — catalog.py

```python
"""
Run once before starting the server: python catalog.py

This script:
1. Loads data/products.json
2. Generates embeddings for each product using paraphrase-multilingual-MiniLM-L12-v2
   - Embeds: name_en + " " + doc_en (English semantic content)
3. Creates a Pinecone index named PINECONE_INDEX_NAME if it doesn't exist
   - Dimension: 384 (MiniLM output)
   - Metric: cosine
4. Upserts all 40 products with metadata:
   - price_aed: float (for metadata filtering)
   - min_age_months: int
   - max_age_months: int
   - tags: list[str]
   - occasion: list[str]
   - category: str
   - name_en: str
   - name_ar: str
   - doc_en: str (full doc, returned with results)
   - doc_ar: str
5. Prints confirmation: "Upserted 40 products to Pinecone index mumzworld-gifts"
"""
```

---

## 14. Eval test cases — test_cases.json (write this FIRST)

```json
[
  {
    "id": 1,
    "type": "easy",
    "input": "thoughtful gift for a 6-month-old under 200 AED",
    "expected_status": "results",
    "expected_behavior": "Returns 2–3 products all priced under 200 AED. Intent extracts budget=200, age=6.",
    "must_not": "Return any product priced over 200 AED"
  },
  {
    "id": 2,
    "type": "easy",
    "input": "educational toy for a 1-year-old",
    "expected_status": "clarification_needed",
    "expected_behavior": "Budget is missing. missing_info includes budget_aed. clarification_question is returned.",
    "must_not": "Return results without knowing the budget"
  },
  {
    "id": 3,
    "type": "easy",
    "input": "baby shower gift under 300 AED",
    "expected_status": "results",
    "expected_behavior": "occasion = baby shower. All results under 300 AED.",
    "must_not": "Return products priced above 300 AED"
  },
  {
    "id": 4,
    "type": "easy",
    "input": "something soothing for a colicky newborn, budget 150 AED",
    "expected_status": "results",
    "expected_behavior": "tags includes soothing. age inferred as 0. All results under 150 AED.",
    "must_not": "Return non-soothing products"
  },
  {
    "id": 5,
    "type": "arabic",
    "input": "هدية لطفل عمره 6 أشهر بأقل من 200 درهم",
    "expected_status": "results",
    "expected_behavior": "language = ar. reason_ar is native Gulf Arabic, not a structural translation of reason_en.",
    "must_not": "Return reason_ar that mirrors reason_en word-for-word in structure"
  },
  {
    "id": 6,
    "type": "arabic",
    "input": "هدية تعليمية للأطفال الصغار، الميزانية 250 درهم",
    "expected_status": "results",
    "expected_behavior": "language = ar. tags includes educational. budget = 250.",
    "must_not": "Return products above 250 AED"
  },
  {
    "id": 7,
    "type": "adversarial",
    "input": "gift under 5 AED",
    "expected_status": "null",
    "expected_behavior": "No products exist under 5 AED. Returns null with a clear explanation.",
    "must_not": "Return any product or hallucinate a cheap product"
  },
  {
    "id": 8,
    "type": "edge",
    "input": "gift",
    "expected_status": "clarification_needed",
    "expected_behavior": "missing_info = [budget_aed, baby_age_months]. clarification_question asks for both.",
    "must_not": "Return results or guess budget/age"
  },
  {
    "id": 9,
    "type": "edge",
    "input": "something affordable for any child",
    "expected_status": "clarification_needed",
    "expected_behavior": "affordable must NOT be inferred as a number. budget_aed = null. missing_info includes budget_aed.",
    "must_not": "Infer budget_aed from the word affordable"
  },
  {
    "id": 10,
    "type": "adversarial",
    "input": "gift for my dog",
    "expected_status": "null",
    "expected_behavior": "Out of scope. confidence low. Returns null with explanation that this is a baby product platform.",
    "must_not": "Return baby products as gifts for a dog"
  },
  {
    "id": 11,
    "type": "adversarial",
    "input": "what is the capital of France",
    "expected_status": "null",
    "expected_behavior": "Completely out of scope. Returns null with explanation.",
    "must_not": "Attempt to answer or return any product"
  },
  {
    "id": 12,
    "type": "edge",
    "input": "gift for a 6-month-old",
    "expected_status": "clarification_needed",
    "expected_behavior": "Age extracted but budget missing. missing_info = [budget_aed].",
    "must_not": "Return results without a budget"
  },
  {
    "id": 13,
    "type": "adversarial",
    "input": "I am looking for a very nice thoughtful meaningful beautiful wonderful special unique creative personalised lovely memorable heartfelt extraordinary exceptional premium deluxe superior outstanding remarkable gift for a baby who is approximately six months old and whose parents are first-time parents living in Dubai and the budget should be somewhere around maybe two hundred dirhams if possible",
    "expected_status": "results",
    "expected_behavior": "Long rambling query. Intent extractor still outputs valid GiftIntent. budget=200, age=6.",
    "must_not": "Fail to parse or return a validation error"
  },
  {
    "id": 14,
    "type": "easy",
    "input": "musical toy for toddler under 200 AED",
    "expected_status": "results",
    "expected_behavior": "tags includes musical. All results under 200 AED. grounded_in is non-empty on all cards.",
    "must_not": "Return a card with empty grounded_in field"
  },
  {
    "id": 15,
    "type": "edge",
    "input": "gift for newborn twins, budget 400 AED total",
    "expected_status": "results",
    "expected_behavior": "Handles edge case gracefully. budget may be interpreted as 200 per child or 400 total.",
    "must_not": "Crash or return a 500 error"
  }
]
```

---

## 15. Eval runner — evals.py

```python
"""
Run: python evals/evals.py

Runs all 15 test cases against the live FastAPI server.
Prints a table with: case ID, type, pass/fail, failure mode (if any).
Prints overall score at the end.

Checks per test case:
- status matches expected_status
- All returned products have non-empty grounded_in
- No product exceeds budget if budget was specified
- language field matches expected language
- For Arabic cases: reason_ar is non-empty
- must_not condition is checked where automatable

Scoring:
- Each case: pass = 1, fail = 0
- Final score printed as X/15 with percentage
- Failures printed with named failure mode
"""
```

---

## 16. Frontend components

### SearchBar.tsx

Props: `onSearch(query: string)`, `onTranscribe(file: Blob)`, `language: "en" | "ar"`, `loading: boolean`

Features:
- Textarea for text input (supports RTL when language = ar)
- Mic button that records audio using MediaRecorder API (outputs webm blob)
- While recording: mic button turns red with a pulsing dot
- On stop: sends audio blob to `onTranscribe`
- Quick-fill chips below input: 5 example queries (3 EN, 2 AR)
- Enter key submits (Shift+Enter for newline)
- Disabled state while `loading` is true

### IntentStrip.tsx

Props: `intent: GiftIntent | null`

Shows parsed intent as coloured pills:
- Budget pill (green): "Budget: 200 AED" — shown only if budget_aed is not null
- Age pill (blue): "Age: 6 months" — shown only if baby_age_months is not null
- Occasion pill (purple): occasion string — shown only if not null
- Tags pills (grey): one per tag
- If missing_info is non-empty: shows a yellow "Missing: budget, age" pill
- Hidden if intent is null

### ProductCard.tsx

Props: `product: GiftCard`, `selected: boolean`, `onToggle: () => void`, `language: "en" | "ar"`

Features:
- Shows name in active language (name_en or name_ar)
- Shows reason in active language (reason_en or reason_ar)
- Price in AED
- Age range
- Confidence bar (coloured fill, width = confidence * 100%)
- Tags as small pills
- Green border + checkmark when selected
- Max 3 selectable at once

### CompareTable.tsx

Props: `products: GiftCard[]`, `compareResponse: CompareResponse`, `language: "en" | "ar"`

Features:
- Rows: Product name, Price, Age range, Match score, Best for (tags), Why it fits (reason)
- Best price cell highlighted green (best_value_id)
- Best match score cell highlighted blue (best_match_id)
- Arabic names/reasons shown when language = ar
- Horizontally scrollable on mobile

### NullState.tsx

Props: `reason: string`

Shows a clean explanation card when status = "null". Never shows an empty grid.

### ClarifyPrompt.tsx

Props: `question: string`, `onAnswer: (answer: string) => void`

Shows the clarification question with a text input to answer. On submit: appends the answer to the original query and re-runs search.

---

## 17. TypeScript types — types/index.ts

Must mirror Pydantic schemas exactly.

```typescript
export type Language = "en" | "ar"

export interface GiftIntent {
  budget_aed: number | null
  baby_age_months: number | null
  occasion: string | null
  tags: string[]
  language: Language
  confidence: number
  missing_info: string[]
}

export interface GiftCard {
  product_id: number
  name_en: string
  name_ar: string
  price_aed: number
  age_range: string
  reason_en: string
  reason_ar: string
  confidence: number
  grounded_in: string
  tags: string[]
  occasion: string[]
}

export type SearchStatus = "results" | "null" | "clarification_needed"

export interface SearchResponse {
  status: SearchStatus
  intent: GiftIntent
  gifts: GiftCard[]
  null_reason: string | null
  clarification_question: string | null
}

export interface CompareResponse {
  products: GiftCard[]
  best_value_id: number
  best_match_id: number
}

export interface TranscribeResponse {
  transcript: string
  language: Language
  confidence: number | null
}
```

---

## 18. API wrappers — lib/api.ts

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function searchGifts(
  query: string,
  language: Language
): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, language }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail ?? "Search failed")
  }
  return res.json()
}

export async function transcribeAudio(
  audioBlob: Blob,
  filename: string
): Promise<TranscribeResponse> {
  const form = new FormData()
  form.append("audio", audioBlob, filename)
  const res = await fetch(`${BASE}/api/transcribe`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail ?? "Transcription failed")
  }
  return res.json()
}

export async function compareProducts(
  productIds: number[]
): Promise<CompareResponse> {
  const res = await fetch(`${BASE}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_ids: productIds }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail ?? "Compare failed")
  }
  return res.json()
}
```

---

## 19. README structure — all 4 required sections

The README must contain exactly these sections in this order.

```markdown
# Mumzworld AI Gift Finder

[One paragraph: what it does, who it's for, what it does — max 5 sentences]

## Setup — run in under 5 minutes

### Prerequisites
- Python 3.11+
- Node.js 18+
- Three free API accounts: Pinecone, OpenRouter, Groq

### Steps
1. git clone ...
2. cd backend && pip install -r requirements.txt
3. cd frontend && npm install
4. cp .env.example .env and fill in the 3 API keys
5. python catalog.py  ← seeds Pinecone (run once)
6. uvicorn main:app --reload  (in backend/)
7. npm run dev  (in frontend/)
8. Open http://localhost:3000

[Note any known setup issues, e.g. Pinecone index creation time]

## Architecture

[Explain WHY each component was chosen, not just what it is]
[Why RAG over plain LLM — the semantic gap between natural language and metadata]
[Why Pinecone over ChromaDB — hosted, metadata filtering, no local setup]
[Why Qwen2.5-72B — best free model for Arabic structured JSON, tested alternatives]
[Why multilingual MiniLM — trained on 50+ languages, handles AR + EN in one model]
[Why Groq Whisper — free hosted Whisper, faster than local, Gulf Arabic support]
[Why Pydantic v2 — field_validator for grounding check, explicit 422 on failure]
[Why Next.js over Streamlit — production-quality UI, typed API contract, better demo]

## Evals

### Rubric
[What each test case checks and why]

### Test cases and scores
[Table: ID | Type | Input | Expected | Actual | Pass/Fail]
[Honest about failures — name the failure mode, explain root cause]

### How to run
python evals/evals.py

## Tradeoffs

### What I considered and rejected
[Streamlit — simpler but weaker UI signal for a product role]
[ChromaDB — local only, less impressive for a deployed demo]
[Web Speech API — poor Arabic accuracy, not controllable]
[GPT-4o — better quality but requires paid key]

### What I cut for time
[List features cut with honest reason]

### Known failure modes
1. Embedding language mismatch — Gulf dialect slang
2. LLM ignoring retrieved context — mitigated by grounded_in validator
3. Arabic that reads as translated — mitigated by prompt, caught by eval case 5
4. Whisper Gulf dialect variance — transcript shown in UI for correction
5. Budget inference on vague language — always triggers clarification

### What I would build next
[Honest list of next steps]

## Tooling

### Models and tools used
| Tool | Used for |
|------|----------|
| Claude Sonnet (claude.ai) | Architecture design, all code generation, prompt iteration |
| Qwen2.5-72B (OpenRouter) | Runtime intent extraction and gift ranking |
| Groq Whisper large-v3 | Audio transcription |
| paraphrase-multilingual-MiniLM | Embedding product docs |

### How I used Claude
[Specific description — pair-coding, how many prompt iterations, what you asked for]

### What worked
[Specific, not generic]

### What didn't work
[Specific failures — what the agent got wrong]

### Where I overruled the agent
[Specific decisions where you changed the generated output and why]

### Key prompts
See prompts/intent_extractor.txt and prompts/ranker_system.txt
[Note how many iterations each prompt took and what changed]
```

---

## 20. Loom recording — 5 inputs, 3 minutes

Record in this order. Narrate every step out loud.

| # | What to show | What to say |
|---|---|---|
| 1 | Type "thoughtful gift for 6-month-old under 200 AED" → show intent strip → show cards | "The intent strip shows what the system understood — budget 200, age 6. Every card cites the source document in the grounded_in field." |
| 2 | Click mic → speak an English query → show Whisper transcript appearing → results load | "Voice goes to Groq Whisper, transcript feeds into the same pipeline as text." |
| 3 | Switch to AR → click mic → speak in Arabic → show language auto-detected → cards in Arabic | "Language is detected by Whisper — the UI switches automatically. The Arabic reasons are written natively, not translated." |
| 4 | Select 3 cards → click Compare → walk through table | "Best value is highlighted green, best match in blue. The reason column shows the full bilingual reasoning." |
| 5 | Type "gift under 5 AED" → show null state | "This is the uncertainty handling. No products exist under 5 AED. The system returns null with an explanation — it never hallucinates a product to fill the result." |

---

## 21. Deployment (optional, for extra signal)

| Part | Free tier |
|---|---|
| Frontend | Vercel — connect GitHub repo, auto-deploys |
| Backend | Render — connect GitHub repo, set env vars, auto-deploys |
| Pinecone | Already hosted |
| Groq | Already hosted |
| OpenRouter | Already hosted |

Set `USE_GROQ=true` and `NEXT_PUBLIC_API_URL=https://your-app.onrender.com` in production env vars.

Note in README: Render free tier spins down after 15 minutes idle. First request after idle takes ~30 seconds. This is expected — mention it in the Loom if demoing the deployed version.

---

## 22. Submission checklist

Before submitting, verify every item:

- [ ] `python catalog.py` runs without error and prints "Upserted 40 products"
- [ ] `uvicorn main:app` starts without error
- [ ] `npm run dev` starts without error
- [ ] `curl -X POST localhost:8000/api/search -H "Content-Type: application/json" -d '{"query":"gift for 6 month old under 200 AED","language":"en"}'` returns valid JSON
- [ ] `python evals/evals.py` runs and prints a score table
- [ ] A query with "gift under 5 AED" returns `status: "null"` with a reason
- [ ] A query with "gift" alone returns `status: "clarification_needed"`
- [ ] `grounded_in` is non-empty on every returned GiftCard
- [ ] `reason_ar` is non-empty on every returned GiftCard
- [ ] Arabic query returns `language: "ar"` in intent
- [ ] README has all 4 sections: Setup, Architecture, Evals, Tradeoffs+Tooling
- [ ] `prompts/` directory has both committed prompt files
- [ ] `.env.example` has all keys with source comments
- [ ] 3-minute Loom recorded with all 5 inputs
- [ ] GitHub repo is public or shareable

---

*Built for Mumzworld AI Engineering Intern assessment — Track A.*
