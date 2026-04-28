# Tradeoffs — Mumzgift AI Gift Finder

This document explains every significant decision made in building this system: what was chosen, what was rejected, and why. It also covers what was cut for time, known failure modes, and what would be built next.

---

## Problem Choice

The brief allowed picking any Mumzworld-adjacent problem. A gift finder was chosen over alternatives (review summariser, size recommender, reorder predictor) for three reasons:

1. **Bilingual complexity is real** — Gulf Arabic gift queries have cultural nuance (occasion names, baby age framing) that purely English product search misses. This is a harder, more interesting problem.
2. **Retrieval grounding is testable** — a gift finder has a clear correctness criterion: did the product exist in the catalog, and is it within budget? This makes evals meaningful and automated, not just vibes.
3. **Uncertainty handling is visible** — a gift finder naturally surfaces the clarification, null, and refusal cases that demonstrate the system knows what it doesn't know.

---

## Architecture Decisions

### RAG over plain LLM

A plain LLM has no access to Mumzworld's real product catalog and will hallucinate product names and prices. RAG grounds every recommendation in the actual catalog: the LLM can only recommend products it received in the retrieved context.

A Pydantic `field_validator` on `GiftCard.grounded_in` enforces this at the schema level — an empty citation raises a HTTP 422 before any response reaches the client. This makes the grounding guarantee programmatic, not just a prompt instruction.

### Metadata pre-filtering in Pinecone

Budget and age are hard constraints, not soft preferences. They are applied as Pinecone server-side metadata filters (`price_aed <= budget`, `min_age_months <= age <= max_age_months`) **before** the vector similarity search runs.

This means the LLM never sees out-of-budget or wrong-age products. It cannot recommend them even if it wanted to. The alternative — filtering after retrieval in Python — would reduce the effective top-k and still require the LLM to reason about budget constraints.

### Guard order in rank_gifts()

The pipeline applies three guards in a specific order before calling the LLM ranker:

```
1. Out-of-scope (confidence < 0.3, no budget, no age) → null
2. No products retrieved (budget/age filter returned nothing) → null
3. Missing budget → clarification_needed
```

This order matters. If clarification came first, a query like "gift for my dog" (confidence 0.1, no budget) would ask "what's your budget?" instead of refusing. Out-of-scope must be caught before clarification.

### Deterministic clarification over LLM self-identification

The decision to ask for clarification is made in Python code, not delegated to the LLM. If `intent.budget_aed is None` and `intent.missing_info` includes `budget_aed`, the system always returns `clarification_needed` — deterministically, regardless of what the LLM thinks it can infer.

This makes the behaviour testable (eval #2, #8, #12) and prevents the LLM from guessing a budget and silently producing wrong results.

---

## Model Choices

### LLM: Groq Llama 3.3 70B Versatile

**Originally designed for:** Qwen2.5-72B-Instruct via OpenRouter (free tier).

**Why Qwen2.5 was the original choice:** In internal testing, Qwen2.5-72B produced more idiomatic Gulf Arabic than any other free-tier model tested, and returned valid JSON without markdown fences more consistently than Llama variants.

**Why we switched to Groq Llama 3.3:** During development, OpenRouter's free tier for all tested models — Qwen2.5-72B, Llama 3.3 70B, Gemma 3 27B, DeepSeek V3 — was rate-limited or returning 404s under load. Groq's hosted Llama 3.3 70B has a genuinely generous free tier, sub-second inference, and consistent JSON output. It was the pragmatic choice for a reliable demo.

**Tradeoff accepted:** Llama 3.3 produces good MSA (Modern Standard Arabic) but is slightly less idiomatic in Gulf dialect than Qwen2.5. Mitigated by explicit prompting ("native Gulf Arabic phrasing, NOT a word-for-word translation").

### Embeddings: paraphrase-multilingual-MiniLM-L12-v2 via fastembed (ONNX)

**Why this model:** Trained on parallel corpora in 50+ languages including Arabic. A single model handles English and Arabic queries without any query translation step. 384-dimensional embeddings keep Pinecone index size and costs minimal.

**Why fastembed instead of sentence-transformers:** `sentence-transformers` loads PyTorch, which alone consumes ~350MB of RAM. Render's free tier has a 512MB limit. Switching to `fastembed` (ONNX runtime) drops the model memory footprint to ~100MB, keeping the full stack comfortably under the limit. The embeddings are mathematically identical — same model weights, different runtime.

**Tradeoff accepted:** The ONNX model is downloaded on first request after a cold start, adding ~5 seconds of latency to the very first query on a fresh server. Subsequent queries are unaffected.

**Why not OpenAI text-embedding-3-small:** Requires a paid API key. Not appropriate for a free-tier demo that evaluators should be able to run without a credit card.

### STT: Groq Whisper large-v3

**Why hosted over local:** Local `openai-whisper` on CPU takes 3–5 seconds per transcription and requires ~2GB of disk for the model weights. Groq's hosted Whisper runs in under a second and returns a `language` field used to auto-switch the UI.

**Fallback:** `USE_GROQ=false` falls back to local Whisper for environments where Groq is unavailable. Torch and openai-whisper are commented out in `requirements.txt` as optional installs.

### Frontend: Next.js 14 over Streamlit

Streamlit is faster to prototype but signals a data-science mindset and has no RTL support. A production AI feature at an e-commerce company ships as a web component. Next.js App Router with TypeScript mirrors how this would integrate into the real Mumzworld platform.

The TypeScript types in `frontend/types/index.ts` mirror the Pydantic schemas exactly, making the API contract explicit and type-checked end-to-end — any schema change in Python surfaces as a TypeScript compile error in the frontend.

---

## Alternatives Considered and Rejected

| Alternative | Reason rejected |
|-------------|----------------|
| ChromaDB instead of Pinecone | Local only, no managed hosting, metadata filtering less expressive, not appropriate for a hosted demo |
| Web Speech API for STT | Poor Gulf Arabic dialect accuracy, no server-side language detection, transcript not accessible for display |
| GPT-4o for LLM | Better Arabic quality, but requires a paid key — evaluators should be able to run the system for free |
| Query translation (AR→EN before embedding) | Loses Arabic semantic nuance; paraphrase-multilingual-MiniLM makes it unnecessary |
| Streaming LLM responses | Improves perceived latency but adds significant complexity to both the FastAPI streaming endpoint and the Next.js SSE client |
| Re-running the full pipeline in /compare | The compare endpoint fetches by ID and builds GiftCards from Pinecone metadata directly. Re-running the full RAG pipeline would be slower and adds non-determinism when comparing the same products |

---

## What Was Cut for Time

| Feature | Reason cut |
|---------|-----------|
| Product images | Requires a real catalog with image URLs or a CDN; not present in synthetic data |
| Saved searches / history | Requires a persistent database (e.g. PostgreSQL on Render); added scope without adding signal |
| Streaming LLM responses | Adds complexity; not needed to demonstrate the core RAG pipeline |
| Unit tests for pipeline stages | Covered by integration evals instead; given the time constraint, end-to-end coverage was more valuable |
| i18n for UI labels | Arabic UI labels are hardcoded inline; a full i18n library would add setup overhead for marginal gain |
| Redis caching for repeated queries | Would meaningfully reduce latency for a production system; not critical for a demo with 40 products |

---

## Known Failure Modes

### 1. Gulf dialect slang in embedding space
The embedding model is trained on standard Arabic, not Gulf dialect. Very colloquial Emirati or Saudi slang may produce weaker embeddings and miss semantically relevant products. Mitigation would require a Gulf-Arabic-specific fine-tune or dialect normalisation layer.

### 2. Arabic copy quality under Llama 3.3
Llama 3.3 70B produces grammatically correct MSA but is less idiomatic in Gulf Arabic than Qwen2.5-72B. The ranker prompt instructs native Gulf phrasing, but this is a best-effort mitigation. A human reviewer would catch this; the automated eval cannot.

### 3. Subtle hallucination in reason fields
`grounded_in` is enforced non-empty by Pydantic, but the `reason_en` and `reason_ar` fields are free-form LLM text. The model could make a claim about a product feature that isn't in the retrieved metadata. The `grounded_in` field is visible to users in the UI specifically so they can verify the source.

### 4. Ambiguous quantities
"400 AED total for twins" is genuinely ambiguous — it could mean 200 per child or 400 total. The system does not crash (eval #15 passes) but the interpretation is left to the LLM and is non-deterministic. A production system would detect the ambiguity and ask a follow-up question.

### 5. Cold start latency
On Render's free tier, the server sleeps after 15 minutes of inactivity. The first request after a cold start downloads the ONNX model (~5 seconds) and initialises the Pinecone client (~1 second). Subsequent requests are fast. A paid plan with always-on instances would eliminate this.

---

## What I Would Build Next

1. **Real Mumzworld catalog integration** — replace the 40 synthetic products with the live catalog via Mumzworld's API or a daily scrape. The pipeline is catalog-agnostic; only `catalog.py` would need to change.
2. **Streaming LLM responses** — pipe the ranker's token stream directly to the client via SSE to reduce perceived latency from ~3s to feeling instant.
3. **User feedback loop** — thumbs up/down on gift cards, stored to a database and used to fine-tune the ranker's system prompt or adjust retrieval weights over time.
4. **Redis caching** — cache `(query_embedding, intent_hash) → SearchResponse` for a short TTL. Repeated or near-identical queries (common in a gift-finding flow) would return instantly.
5. **Gulf Arabic embedding fine-tune** — fine-tune MiniLM on a Gulf Arabic parallel corpus to improve retrieval quality for dialect queries.
6. **Personalisation** — track previous searches per user session and surface complementary products or avoid already-seen recommendations.
