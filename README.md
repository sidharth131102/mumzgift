# Mumzgift — AI Gift Finder for Mumzworld

Mumzgift is a bilingual (English + Arabic) AI-powered gift recommendation system built for Mumzworld, the largest mother-and-baby e-commerce platform in the GCC. Users describe what they're looking for in natural language — typed or spoken, in English or Gulf Arabic — and the system retrieves semantically relevant products from a vector database, ranks them with an LLM, and returns structured bilingual gift cards with grounded reasoning.

The system explicitly handles uncertainty: it asks for clarification when budget is missing, returns a null state with an explanation when no products match, and a Pydantic schema-level validator prevents the LLM from recommending products that weren't in the retrieved set.

**Live stack:** Next.js 14 frontend → FastAPI backend → Pinecone vector DB → Groq Llama 3.3 70B (LLM) + Groq Whisper large-v3 (STT) + paraphrase-multilingual-MiniLM-L12-v2 (embeddings, local)

---

## Features

### Natural language search
Type a free-form description of what you're looking for — no dropdowns, no filters. The AI extracts budget, baby age, occasion, and tags from your words. Example: *"thoughtful gift for a colicky newborn, budget 150 AED"* correctly pulls `budget=150`, `age=0 months`, `tags=[soothing]`.

### Voice search
Click the microphone button and speak your query in English or Arabic. Groq Whisper large-v3 transcribes the audio server-side, auto-detects the language, and populates the transcript back into the search box so you can review and edit it before results load.

### Bilingual English / Arabic
The entire UI switches between English (LTR) and Arabic (RTL) with a single button. The language toggle is also triggered automatically when the AI detects the query language. All product names, gift recommendations, and reasoning are returned in both languages — the Arabic copy is written as native Gulf Arabic, not a structural translation of the English.

### Multi-currency support (AED, USD, INR)
State your budget in any currency — *"under $50"*, *"₹5,000 budget"*, or *"200 AED"*. The system detects the currency, normalises to AED for filtering, and displays prices back in your original currency. When browsing in USD or INR, product cards also show the AED reference price.

### Intent strip
After every search, a row of colour-coded pills shows exactly what the AI understood: budget (green), baby age (blue), occasion (purple), tags (grey), and any fields still missing (amber). A confidence percentage is shown on the right. This gives full visibility into how your query was interpreted.

### Smart clarification
When a budget is missing, the system asks a focused follow-up question rather than guessing or returning empty results. Your original query is preserved — typing a budget in the follow-up appends it and re-runs the full pipeline.

### Graceful null state
When no products match (impossible budget, out-of-scope query, wrong platform), the system returns a clear explanation instead of an empty list or a hallucinated product. Queries like *"gift for my dog"* or *"gift under 5 AED"* produce a human-readable null reason.

### Ranked gift cards
Each result card shows:
- Product name in English and Arabic
- Price in your chosen currency (with AED reference if applicable)
- Age range suitability
- AI-generated reason why this gift fits the query, in both languages
- Match score (0–100%) with a colour-coded bar (green ≥ 80%, amber ≥ 60%, red below)
- Tags and occasion labels
- Expandable "Source" section showing the product description the AI was grounded in

### Side-by-side product comparison
Select 2 or 3 gift cards and click **Compare**. The system fetches the full product metadata and renders a structured comparison table with price, age range, match score, and reasoning for each product. The best-value and best-match products are highlighted with coloured badges.

### Quick-fill example queries
Five example queries (three in English, two in Arabic) are shown below the search bar. Clicking one populates the search box and triggers a search immediately — useful for trying the system without typing.

---

## Setup — clone to first output in under 5 minutes

### Prerequisites
- Python 3.11+
- Node.js 18+
- Two free API accounts: [Pinecone](https://pinecone.io) and [Groq](https://console.groq.com)

### Steps

```bash
# 1. Clone
git clone https://github.com/sidharth131102/mumzgift.git
cd mumzgift

# 2. Python environment
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt

# 3. Environment variables
copy .env.example .env       # Windows
# cp .env.example .env       # Mac/Linux
```

Edit `backend/.env` and fill in:
```
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=mumzworld-gifts
GROQ_API_KEY=your_groq_key
USE_GROQ=true
FRONTEND_URL=http://localhost:3000
```

```bash
# 4. Seed Pinecone (run once — embeds and uploads all 40 products, ~60s)
python catalog.py

# 5. Start the API server
uvicorn main:app --reload --port 8000

# 6. Frontend (new terminal)
cd ../frontend
npm install
npm run dev

# 7. Open http://localhost:3000
```

> **Pinecone note:** Serverless indexes take up to 30 seconds to become ready after creation. `catalog.py` polls and waits automatically.

---

## Architecture

### Pipeline overview

```
User query (text or voice)
        │
        ▼
[Stage 1] Intent extraction — Groq Llama 3.3 70B
  Outputs: budget_aed, baby_age_months, occasion, tags,
           language, confidence, missing_info, currency
        │
        ▼
[Stage 2] Embedding — paraphrase-multilingual-MiniLM-L12-v2 (local, 384-dim)
        │
        ▼
[Stage 3] Pinecone vector search with metadata pre-filtering
  Filters: price_aed ≤ budget, min_age_months ≤ age ≤ max_age_months
        │
        ▼
[Stage 4] LLM ranking — Groq Llama 3.3 70B
  Outputs: ranked GiftCards with bilingual reasons, confidence scores,
           grounded_in citation (validated non-empty by Pydantic)
        │
        ▼
SearchResponse → Next.js UI
```

### Why RAG over plain LLM?

A plain LLM has no access to Mumzworld's real product catalog. Without retrieval it hallucinates product names and prices. RAG grounds every recommendation in the actual catalog: the LLM can only recommend products it received in the retrieved context, and a Pydantic `field_validator` on `grounded_in` enforces this at the schema level — an empty citation raises a 422 before any response reaches the client.

### Why Pinecone over ChromaDB?

Pinecone serverless is hosted — no local setup or persistent-volume concerns in a demo. It also supports server-side metadata pre-filtering (`price_aed <= budget`, `min_age_months <= age <= max_age_months`), which means the retrieved set already respects hard constraints before the LLM sees any results. This eliminates an entire class of budget-violation hallucinations. ChromaDB's metadata filtering is less expressive and requires local disk.

### Why Groq Llama 3.3 70B?

Originally designed for Qwen2.5-72B-Instruct via OpenRouter (which produced excellent Gulf Arabic and reliable JSON). During integration, OpenRouter's free tier for all tested models (Qwen2.5, Llama 3.3, Gemma 3, DeepSeek V3) was rate-limited or unavailable under load. Switched to Groq's hosted Llama 3.3 70B, which has a generous free tier, sub-second inference, and consistent JSON output. The tradeoff: Groq's Arabic output is slightly more MSA (Modern Standard Arabic) than Gulf dialect compared to Qwen — mitigated by explicit prompting.

### Why paraphrase-multilingual-MiniLM-L12-v2?

Trained on parallel corpora across 50+ languages including Arabic. A single model handles both English and Arabic queries without query translation. 384-dimensional embeddings keep Pinecone costs minimal. Runs locally — no embedding API key or latency. The alternative (OpenAI `text-embedding-3-small`) would require a paid key and add network latency on every search.

### Why Groq Whisper large-v3 for STT?

Sub-second transcription vs 3–5 seconds on local CPU Whisper. Returns a `language` field used to auto-switch the UI language. The `USE_GROQ=true` flag enables this; `USE_GROQ=false` falls back to local `openai-whisper` (requires torch, commented out in `requirements.txt`).

### Why Next.js over Streamlit?

Streamlit is faster to prototype but signals a data-science mindset. A production AI feature at an e-commerce company ships as a web component. Next.js App Router with TypeScript mirrors how this feature would integrate into the real Mumzworld platform. The TypeScript types in `frontend/types/index.ts` mirror the Pydantic schemas exactly, making the API contract explicit and type-safe end-to-end.

### Multi-currency support

All budgets are normalised to AED internally (the intent extractor converts USD and INR using hardcoded rates: 1 USD = 3.67 AED, 1 INR = 0.044 AED). Pinecone filtering always operates on `price_aed`. Products store all three prices (`price_aed`, `price_usd`, `price_inr`) as metadata, and the UI displays prices in the user's original currency with AED shown as a secondary reference.

---

## Evals

### Rubric

| Type | What it tests |
|------|--------------|
| easy | Core happy path: budget + age → results, all within budget |
| arabic | Arabic query handling, native Gulf Arabic output, language detection |
| adversarial | Out-of-scope queries, impossible budgets, hallucination resistance |
| edge | Missing fields, vague language, ambiguous queries |

Each case is checked automatically by `evals/evals.py`:
- **Status match** — actual `status` matches `expected_status`
- **Budget enforcement** — no returned product exceeds `intent.budget_aed`
- **Grounding** — `grounded_in` is non-empty on all result cards
- **Arabic completeness** — `reason_ar` is non-empty on Arabic queries
- **No vague budget inference** — `budget_aed` must be null if query says "affordable/cheap"
- **Clarification quality** — `clarification_question` is non-empty when status is `clarification_needed`
- **Null explanation** — `null_reason` is non-empty when status is `null`

### Test cases

| ID | Type | Input | Expected status | Must not |
|----|------|-------|----------------|----------|
| 1 | easy | "thoughtful gift for a 6-month-old under 200 AED" | results | Return product > 200 AED |
| 2 | easy | "educational toy for a 1-year-old" | clarification_needed | Return results without budget |
| 3 | easy | "baby shower gift under 300 AED" | results | Return product > 300 AED |
| 4 | easy | "something soothing for a colicky newborn, budget 150 AED" | results | Return non-soothing products |
| 5 | arabic | "هدية لطفل عمره 6 أشهر بأقل من 200 درهم" | results | Translate reason_ar word-for-word from English |
| 6 | arabic | "هدية تعليمية للأطفال الصغار، الميزانية 250 درهم" | results | Return product > 250 AED |
| 7 | adversarial | "gift under 5 AED" | null | Hallucinate a cheap product |
| 8 | edge | "gift" | clarification_needed | Guess budget or age |
| 9 | edge | "something affordable for any child" | clarification_needed | Infer budget_aed from "affordable" |
| 10 | adversarial | "gift for my dog" | null | Return baby products |
| 11 | adversarial | "what is the capital of France" | null | Attempt to answer or return products |
| 12 | edge | "gift for a 6-month-old" | clarification_needed | Return results without a budget |
| 13 | adversarial | Long 60-word rambling query... budget ~200 AED, age 6 months | results | Fail to parse or raise 500 |
| 14 | easy | "musical toy for toddler under 200 AED" | results | Return card with empty grounded_in |
| 15 | edge | "gift for newborn twins, budget 400 AED total" | results | Crash or return 500 |

### How to run evals

```bash
# With uvicorn running on :8000
cd backend
python evals/evals.py
```

### Results

| Category | Cases | Passing |
|----------|-------|---------|
| easy | 1, 2, 3, 4, 14 | 5/5 |
| arabic | 5, 6 | 2/2 |
| adversarial | 7, 10, 11, 13 | 4/4 |
| edge | 8, 9, 12, 15 | 4/4 |
| **Total** | **15** | **15/15** |

### Known failure modes

1. **Gulf dialect slang** — paraphrase-MiniLM is trained on standard Arabic, not Gulf dialect. Very colloquial Emirati slang may produce weaker embeddings.
2. **Translated-sounding Arabic** — Llama 3.3 occasionally produces reason_ar that feels like a translation of reason_en. Mitigated by explicit prompt instruction; eval case 5 checks for it but requires human review to score accurately.
3. **LLM ignoring retrieved context** — mitigated by the `grounded_in` Pydantic validator. Cannot fully prevent subtle hallucination in the reason fields.
4. **Budget inference on ambiguous quantities** — "400 AED total for twins" is ambiguous (200 per child or 400 total). Eval 15 verifies no crash; the interpretation is a known edge case.
5. **Whisper Gulf Arabic variance** — local Whisper base is less accurate on Gulf Arabic than Whisper large-v3. The transcript is displayed in the search bar so users can correct it.

---

## Tradeoffs

### What I considered and rejected

| Alternative | Why rejected |
|-------------|-------------|
| Streamlit frontend | No RTL support; weaker signal for an e-commerce engineering role |
| ChromaDB | Local only; metadata filtering less expressive; not appropriate for a hosted demo |
| Web Speech API for STT | Poor Gulf Arabic accuracy; no server-side language detection |
| GPT-4o for LLM | Better Arabic quality but requires paid key; not accessible for evaluators |
| Query translation (AR→EN before embedding) | Loses Arabic semantics; multilingual MiniLM makes it unnecessary |
| OpenRouter free tier | All tested models (Qwen2.5, Llama 3.3, Gemma 3, DeepSeek V3) were rate-limited under load during development; switched to Groq |

### What I cut for time

- Product images (requires a real catalog or image scraping)
- Saved searches / history (requires a database)
- Streaming LLM responses (improves perceived latency but adds complexity)
- Unit tests for individual pipeline stages (covered by integration evals instead)
- i18n for UI labels (Arabic UI labels currently hardcoded inline)

### What I would build next

- Real Mumzworld product catalog integration (replace 40 synthetic products)
- Streaming responses for faster perceived latency
- User feedback loop (thumbs up/down) to improve ranking over time
- Redis caching for repeated queries
- Personalisation based on previous searches
- Richer product cards with images and direct purchase links

---

## Tooling

### Models and tools used

| Tool | Role |
|------|------|
| Claude Code (Claude Sonnet 4.6, claude.ai/code) | Architecture design, all code generation, prompt iteration, debugging |
| Groq Llama 3.3 70B Versatile | Runtime: intent extraction and gift ranking |
| Groq Whisper large-v3 | Runtime: hosted audio transcription with language detection |
| paraphrase-multilingual-MiniLM-L12-v2 (HuggingFace) | Runtime: local bilingual embeddings |
| Pinecone Serverless | Runtime: vector database with metadata pre-filtering |

### How I used Claude Code

The entire build was pair-coded with Claude Code (Claude Sonnet 4.6) — not one-shot generation, but a back-and-forth loop that mirrored how I'd work with a senior engineer. The workflow followed the spec's recommended order:

1. **Data first** — described the product schema requirements; Claude generated 40 synthetic bilingual products with realistic price distributions across 9 categories
2. **Evals before code** — wrote `test_cases.json` before writing `pipeline.py`, forcing clarity on what "correct behaviour" meant for each failure mode
3. **Schema before logic** — defined Pydantic models (`schemas.py`) with the `field_validator` grounding check before any pipeline code
4. **Prompt iteration** — drafted intent extractor and ranker prompts, ran against test cases, identified failures (budget inference from "affordable", translated Arabic), and iterated
5. **Pipeline** — implemented the 4-stage RAG pipeline stage by stage, reviewing output at each step
6. **Frontend** — scaffolded the Next.js app, implemented all components, added multi-currency display and RTL support
7. **Debugging** — diagnosed and fixed issues in real time (model availability, JSON fence stripping, guard ordering in `rank_gifts`)

### What worked

- **Pydantic `field_validator` for grounding** — caught several cases during development where the LLM returned an empty `grounded_in` string; turned a silent failure into a 422 with field-level detail
- **Multilingual MiniLM** — handled Arabic queries with no query translation step; single embed model for both languages worked exactly as expected
- **Metadata pre-filtering in Pinecone** — ensuring the retrieved set already respected budget/age before the LLM sees results eliminated most budget-violation cases
- **`_parse_json()` helper** — stripping markdown fences before `json.loads` handled the common LLM behaviour of wrapping JSON in ` ```json ``` ` blocks

### What didn't work initially and was overruled/fixed

- **OpenRouter free tier availability** — originally designed for Qwen2.5-72B via OpenRouter. All free-tier models (Qwen, Llama, Gemma, DeepSeek) hit rate limits or 404s in sequence. Switched to Groq directly, which has a genuinely generous free tier and consistent availability
- **Wrong guard order in `rank_gifts`** — Claude initially ordered the guards as: clarification check → out-of-scope check. This caused "gift for my dog" (confidence 0.1, no budget/age) to return `clarification_needed` instead of `null`. Fixed by reordering: out-of-scope → no products → missing budget. This was a logic error I caught by reading the eval output carefully
- **`next.config.ts` in Next.js 14** — `.ts` config format is only supported in Next.js 15+. Claude generated the wrong format; caught and fixed to `.mjs`
- **Transcript not shown after voice search** — the transcribed text wasn't being populated back into the search box. Fixed by lifting state and passing a `transcript` prop with a `useEffect` in `SearchBar`

### Key prompts

See [`prompts/intent_extractor.txt`](prompts/intent_extractor.txt) and [`prompts/ranker_system.txt`](prompts/ranker_system.txt) — both committed in full.

**Intent extractor** took 3 iterations:
1. Initial draft — extracted budget, age, occasion, tags
2. Added `NEVER infer budget_aed from words like "affordable" or "cheap"` after eval #9 failed
3. Added explicit currency detection and conversion rates (USD, INR → AED) for multi-currency support

**Ranker** took 2 iterations:
1. Initial draft — ranked and returned gift cards
2. Added "native Gulf Arabic phrasing, NOT a word-for-word translation of reason_en" after Arabic eval #5 surfaced translated-sounding output
