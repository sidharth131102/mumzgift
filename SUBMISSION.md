# Mumzworld AI Intern — Track A | Sidharth Unnikrishnan

---

## Summary

I built **Mumzgift**, a bilingual AI gift recommendation system for Mumzworld. It lets users describe what they're looking for in natural language — typed or spoken, in English or Gulf Arabic — and returns ranked, grounded gift recommendations from a 40-product catalog. The system uses a 4-stage RAG pipeline: a Groq LLM extracts structured intent from the query, a multilingual embedding model encodes it, Pinecone retrieves semantically relevant products with metadata pre-filtering (budget, age), and a second LLM call ranks and explains the results. It handles uncertainty explicitly: it asks for clarification when budget is missing, returns a null state with a human-readable explanation when no products match, and a Pydantic schema-level validator prevents the LLM from recommending products outside the retrieved set. The frontend is a Next.js 14 app with full RTL support, multi-currency display (AED, USD, INR), voice search, and a side-by-side product comparison table.

---

## Track A — Prototype Access

**GitHub repo:** https://github.com/sidharth131102/mumzgift

**Setup (under 5 minutes):**
```bash
git clone https://github.com/sidharth131102/mumzgift.git
cd mumzgift/backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
# Fill in backend/.env with PINECONE_API_KEY, PINECONE_INDEX_NAME, GROQ_API_KEY, USE_GROQ=true
python catalog.py          # seed Pinecone once (~60s)
uvicorn main:app --reload --port 8000

# New terminal
cd ../frontend && npm install && npm run dev
# Open http://localhost:3000
```

Full setup instructions with prerequisites: [README.md](README.md)

---

## 3-Minute Walkthrough

**Loom:** *(paste your Loom link here after recording)*

The walkthrough covers 5 inputs end-to-end:
1. English happy path — budget + age → ranked results
2. Arabic query — RTL UI, native Arabic gift cards
3. Missing budget → clarification prompt
4. Out-of-scope query ("gift for my dog") → refusal with explanation
5. Voice search → transcript display → results → side-by-side comparison

---

## Markdown Deliverables

- [EVALS.md](EVALS.md) — Rubric, all 15 test cases, how to run, results (15/15), named failure modes, honest assessment
- [TRADEOFFS.md](TRADEOFFS.md) — Problem choice, architecture decisions, model choices, alternatives rejected, what was cut, known failure modes, what's next

---

## AI Usage Note

Built entirely with **Claude Code (Claude Sonnet 4.6)** as a pair-coding partner across the full stack — architecture, all Python backend, all Next.js frontend, prompt design, and debugging. The runtime stack uses **Groq Llama 3.3 70B** for intent extraction and gift ranking, **Groq Whisper large-v3** for voice transcription, and **paraphrase-multilingual-MiniLM-L12-v2** (via fastembed/ONNX) for bilingual embeddings. I designed the system, wrote the eval cases, reviewed all generated code, caught and fixed logic errors (guard ordering in the pipeline, model availability issues, CORS setup), and made every architecture decision. Full AI usage detail is in the Tooling section of [README.md](README.md#tooling).

---

## Time Log

| Phase | Time |
|-------|------|
| Spec review, architecture design, data (products.json, test cases) | ~1.5 hrs |
| Backend — schemas, pipeline, catalog, FastAPI routes, prompts | ~2 hrs |
| Frontend — Next.js app, all components, RTL, multi-currency | ~1.5 hrs |
| Debugging — model availability, JSON parsing, memory limits, deployment | ~1.5 hrs |
| Documentation — README, EVALS.md, TRADEOFFS.md, SUBMISSION.md | ~1 hr |
| **Total** | **~7.5 hrs** |

Went over the 5-hour guideline. The extra time was split between iterating on the LLM prompt (3 rounds on the intent extractor) and debugging the Render deployment (OOM from PyTorch → switched to fastembed ONNX).
