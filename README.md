# Mumzgift — AI Gift Finder

Mumzgift is a bilingual AI-powered gift recommendation system built for Mumzworld, the largest mother-and-baby e-commerce platform in the GCC. Users describe what they are looking for in natural language — typed or spoken, in English or Gulf Arabic — and the system retrieves semantically relevant products from a vector database, ranks them using an LLM, and returns structured bilingual gift cards with grounded reasoning. The system explicitly handles uncertainty: it asks for clarification when budget is missing, returns null with an explanation when no products match, and never hallucinates a product outside the retrieved set.

---

## Setup — run in under 5 minutes

### Prerequisites
- Python 3.11+
- Node.js 18+
- Three free API accounts: [Pinecone](https://pinecone.io), [OpenRouter](https://openrouter.ai), [Groq](https://console.groq.com)

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd mumzgift

# 2. Backend
cd backend
pip install -r requirements.txt

# 3. Environment variables
cp ../.env.example .env
# Open .env and fill in PINECONE_API_KEY, PINECONE_INDEX_NAME, OPENROUTER_API_KEY, GROQ_API_KEY

# 4. Seed Pinecone (run once — takes ~60s to embed 40 products)
python catalog.py

# 5. Start the API server
uvicorn main:app --reload

# 6. Frontend (new terminal)
cd ../frontend
npm install
# .env.local is already set to http://localhost:8000
npm run dev

# 7. Open http://localhost:3000
```

> **Note:** Pinecone serverless indexes can take up to 30 seconds to be ready after creation. `catalog.py` polls and waits automatically.

---

## Architecture

### Why RAG over plain LLM?

A plain LLM does not have access to Mumzworld's real product catalog. Without retrieval, the model hallucinates product names and prices. RAG grounds every recommendation in the actual catalog: the model can only recommend products it has seen in the retrieved context, and a Pydantic `field_validator` on `grounded_in` enforces this at the schema level — an empty citation fails validation and raises a 422.

### Why Pinecone over ChromaDB?

Pinecone serverless is hosted — no local setup, no port conflicts, no persistent-volume concerns in a demo environment. It also supports server-side metadata pre-filtering (`price_aed <= budget`, `min_age_months <= age <= max_age_months`), which means the vector search already respects hard constraints before the LLM sees any results. ChromaDB's metadata filtering at the time of building was less expressive and requires local disk.

### Why Qwen2.5-72B-Instruct via OpenRouter?

Tested against GPT-3.5-turbo-free, Mistral-7B, and Llama-3-8B on the Arabic JSON output task. Qwen2.5-72B consistently produced well-formed Gulf Arabic that read as native copy rather than a structural translation, and reliably returned valid JSON without markdown fences. GPT-4o produces better output but requires a paid key — not appropriate for a free-tier demo. OpenRouter gives a unified API over free-tier models.

### Why paraphrase-multilingual-MiniLM-L12-v2?

Trained on parallel corpora in 50+ languages including Arabic. A single model handles both English and Arabic queries without language detection or query translation. 384-dimensional embeddings keep Pinecone costs minimal. The model runs locally — no embedding API key or latency.

### Why Groq Whisper large-v3?

Groq's hosted Whisper is faster than running `whisper-base` locally (sub-second vs 3–5 seconds on CPU) and returns a `language` field with detected language — used to auto-switch the UI. The `USE_GROQ` flag lets the system fall back to local Whisper if Groq is unavailable.

### Why Pydantic v2?

`field_validator` lets us encode domain constraints directly in the schema: `grounded_in` cannot be empty, `reason_ar` cannot be empty, `confidence` must be in [0, 1]. Any LLM output that violates these raises a `ValidationError` which FastAPI converts to a 422 with field-level detail — never a silent failure.

### Why Next.js over Streamlit?

Streamlit is faster to prototype but signals a data-science mindset. A production AI feature at an e-commerce company ships as a web component, not a Streamlit app. Next.js App Router with TypeScript mirrors how this feature would be integrated into the real Mumzworld platform. The typed API contract (`types/index.ts`) mirrors the Pydantic schemas exactly.

---

## Evals

### Rubric

Each test case checks a specific failure mode the pipeline must handle:

| Type | What it tests |
|------|--------------|
| easy | Core happy-path: budget + age + results, all within budget |
| arabic | Arabic query handling, native Gulf Arabic output, language detection |
| adversarial | Out-of-scope queries, impossible budgets, hallucination resistance |
| edge | Missing fields, vague language, malformed queries |

### Test cases

| ID | Type | Input (truncated) | Expected | Must not |
|----|------|-------------------|----------|----------|
| 1 | easy | "gift for 6-month-old under 200 AED" | results | Return product > 200 AED |
| 2 | easy | "educational toy for 1-year-old" | clarification_needed | Return results without budget |
| 3 | easy | "baby shower gift under 300 AED" | results | Return product > 300 AED |
| 4 | easy | "soothing gift for colicky newborn, budget 150 AED" | results | Return non-soothing products |
| 5 | arabic | "هدية لطفل 6 أشهر بأقل من 200 درهم" | results | Translate Arabic reason word-for-word |
| 6 | arabic | "هدية تعليمية، الميزانية 250 درهم" | results | Return product > 250 AED |
| 7 | adversarial | "gift under 5 AED" | null | Hallucinate a cheap product |
| 8 | edge | "gift" | clarification_needed | Guess budget or age |
| 9 | edge | "something affordable for any child" | clarification_needed | Infer budget_aed from "affordable" |
| 10 | adversarial | "gift for my dog" | null | Return baby products |
| 11 | adversarial | "what is the capital of France" | null | Attempt to answer |
| 12 | edge | "gift for a 6-month-old" | clarification_needed | Return results without budget |
| 13 | adversarial | Long rambling query... budget ~200 AED, age 6 months | results | Fail to parse or raise 500 |
| 14 | easy | "musical toy for toddler under 200 AED" | results | Return card with empty grounded_in |
| 15 | edge | "gift for newborn twins, budget 400 AED total" | results | Crash or return 500 |

### How to run

```bash
# With the API server running on :8000
cd backend
python evals/evals.py
```

Prints a table of pass/fail with named failure modes and a final score (X/15).

### Named failure modes

1. **Budget inference from vague language** — model infers `budget_aed` from "affordable". Caught by eval #9.
2. **Out-of-scope hallucination** — model returns baby products for "gift for my dog". Caught by eval #10.
3. **Empty grounded_in** — LLM omits the citation. Caught by Pydantic validator + eval #14.
4. **Arabic as structural translation** — reason_ar mirrors English sentence structure. Caught by eval #5 (human review required).
5. **Budget violation** — product above stated budget returned. Caught by eval #1, #3, #4, #6.
6. **Parser failure on long query** — LLM fails to parse a verbose query. Caught by eval #13.

---

## Tradeoffs

### What I considered and rejected

| Alternative | Why rejected |
|-------------|-------------|
| Streamlit frontend | Weaker product signal for an e-commerce role; no RTL support |
| ChromaDB | Local only; metadata filtering less expressive; not impressive for a hosted demo |
| Web Speech API for STT | Poor Gulf Arabic dialect accuracy; no server-side language detection |
| GPT-4o for LLM | Better Arabic quality but requires a paid key; not accessible for reviewers |
| Query translation (AR→EN before embed) | Loses Arabic semantics; multilingual MiniLM makes it unnecessary |

### What I cut for time

- Product images (would require a real catalog or image generation)
- Saved searches / history (would require a database)
- Streaming LLM responses (improves perceived latency but adds complexity)
- i18n for UI labels (currently hardcoded; Arabic UI labels done inline)
- Unit tests for pipeline stages (covered by integration evals instead)

### Known failure modes

1. **Gulf dialect slang in embedding space** — paraphrase-MiniLM is trained on standard Arabic, not Gulf dialect. Queries using very colloquial Gulf Arabic (e.g. Emirati slang) may produce weaker embeddings.
2. **LLM ignoring retrieved context** — mitigated by the `grounded_in` Pydantic validator, which forces the model to cite the source. Cannot fully prevent hallucination in the `reason_en`/`reason_ar` fields.
3. **Arabic that reads as translated** — mitigated by explicit prompt instruction. Eval case 5 checks for it, but requires human review to score accurately.
4. **Whisper Gulf dialect variance** — `whisper-base` (local) is less accurate on Gulf Arabic than Whisper large-v3 (Groq). The transcript is shown in the search bar so users can correct it.
5. **Budget inference on ambiguous quantities** — "400 AED total for twins" is ambiguous (200 per child or 400 total). Eval case 15 verifies the system does not crash; the interpretation is a known edge case.

### What I would build next

- Real Mumzworld product catalog integration (replace mock data)
- Streaming LLM responses for faster perceived latency
- User feedback loop (thumbs up/down) to improve ranking over time
- Caching layer for repeated queries (Redis)
- Personalisation based on previous searches
- Deployed demo on Vercel + Render with `USE_GROQ=true`

---

## Tooling

### Models and tools used

| Tool | Used for |
|------|----------|
| Claude Sonnet 4.6 (claude.ai/code) | Architecture design, all code generation, prompt iteration |
| Qwen2.5-72B-Instruct (OpenRouter) | Runtime intent extraction and gift ranking |
| Groq Whisper large-v3 | Hosted audio transcription |
| paraphrase-multilingual-MiniLM-L12-v2 | Local embedding of product docs and queries |
| Pinecone Serverless | Vector database with metadata filtering |

### How I used Claude

Used Claude Code (Claude Sonnet 4.6) for the entire build — pair-coding the architecture, writing all backend and frontend files, and iterating on the intent extraction and ranker prompts. The build followed the spec's order: data → test cases → schemas → prompts → pipeline → frontend → evals. Each stage was reviewed before moving to the next.

### What worked

- Pydantic `field_validator` for the grounding check — caught several cases during development where the LLM returned an empty `grounded_in` string
- The multilingual MiniLM model — handled Arabic queries without any query translation step
- Metadata pre-filtering in Pinecone — ensuring the retrieved set already respects budget/age before the LLM sees it reduced hallucinated budget violations

### What didn't work initially

- Qwen2.5-72B occasionally returned JSON wrapped in markdown fences (```json ... ```) — fixed by stripping the response before `json.loads`
- Early versions of the ranker prompt produced `reason_ar` that mirrored English structure — fixed by adding the explicit "NOT a word-for-word translation" instruction and "native Gulf Arabic phrasing" guidance

### Where I overruled the agent

- Added `clarification_needed` handling before the LLM ranking call (in `rank_gifts`) rather than relying on the LLM to self-identify missing info — this makes the behaviour deterministic and testable
- Kept the `compare` endpoint simple (fetch by ID + build GiftCards from metadata) rather than re-running the full pipeline, which would be slower and unnecessary

### Key prompts

See [prompts/intent_extractor.txt](prompts/intent_extractor.txt) and [prompts/ranker_system.txt](prompts/ranker_system.txt).

The intent extractor prompt took 3 iterations: (1) initial draft, (2) added the explicit "NEVER infer from affordable/cheap" rule after eval #9 failed, (3) added currency conversion note for SAR/USD queries. The ranker prompt took 2 iterations: (1) initial draft, (2) added "native Gulf Arabic phrasing, NOT a word-for-word translation" after Arabic eval #5 surfaced translated-sounding output.
