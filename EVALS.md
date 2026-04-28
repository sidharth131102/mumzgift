# Evals — Mumzgift AI Gift Finder

This document covers the evaluation strategy, all 15 test cases, how to run the eval harness, results, and an honest assessment of failure modes.

---

## Philosophy

Evals were written **before** the pipeline code — not after. This forced clarity on what "correct behaviour" meant for each case before any implementation decisions were made. The 15 cases are grouped into four categories, each targeting a distinct failure mode the system must handle.

---

## Rubric

Each test case is evaluated automatically by `backend/evals/evals.py` against the live API. The following checks are applied depending on the response status:

| Check | Applies when | What it verifies |
|-------|-------------|-----------------|
| Status match | Always | `response.status` equals `expected_status` |
| Budget enforcement | `status = results` | No returned product has `price_aed > intent.budget_aed` |
| Grounding | `status = results` | Every gift card has a non-empty `grounded_in` field |
| Arabic completeness | Arabic queries | Every gift card has a non-empty `reason_ar` field |
| No vague budget inference | Queries with "affordable/cheap" | `intent.budget_aed` must be `null` |
| Clarification quality | `status = clarification_needed` | `clarification_question` is non-empty |
| Null explanation | `status = null` | `null_reason` is non-empty |

---

## Test Cases

### Category breakdown

| Category | Purpose | Case IDs |
|----------|---------|----------|
| easy | Core happy path — budget + age → ranked results within budget | 1, 2, 3, 4, 14 |
| arabic | Arabic query handling, RTL output, native Gulf Arabic copy | 5, 6 |
| adversarial | Out-of-scope queries, impossible budgets, robustness under noise | 7, 10, 11, 13 |
| edge | Missing fields, vague language, ambiguous quantities | 8, 9, 12, 15 |

### Full test case table

| ID | Category | Input | Expected status | Pass condition | Must NOT do |
|----|----------|-------|----------------|----------------|-------------|
| 1 | easy | `"thoughtful gift for a 6-month-old under 200 AED"` | `results` | Returns 2+ products, all ≤ 200 AED. Intent: budget=200, age=6 | Return any product priced over 200 AED |
| 2 | easy | `"educational toy for a 1-year-old"` | `clarification_needed` | `missing_info` includes `budget_aed`. Clarification question is non-empty | Return results without a budget |
| 3 | easy | `"baby shower gift under 300 AED"` | `results` | All products ≤ 300 AED. Intent: occasion=baby shower | Return products above 300 AED |
| 4 | easy | `"something soothing for a colicky newborn, budget 150 AED"` | `results` | All products ≤ 150 AED. Tags include soothing. Age inferred as 0 months | Return unrelated non-soothing products |
| 5 | arabic | `"هدية لطفل عمره 6 أشهر بأقل من 200 درهم"` | `results` | `language=ar`. `reason_ar` is native Gulf Arabic phrasing | Return `reason_ar` that is a word-for-word structural translation of `reason_en` |
| 6 | arabic | `"هدية تعليمية للأطفال الصغار، الميزانية 250 درهم"` | `results` | `language=ar`. All products ≤ 250 AED. Tags include educational | Return products above 250 AED |
| 7 | adversarial | `"gift under 5 AED"` | `null` | `null_reason` explains no products exist at that price | Hallucinate or fabricate a product priced under 5 AED |
| 8 | edge | `"gift"` | `clarification_needed` | `missing_info` includes both `budget_aed` and `baby_age_months`. Clarification question asks for both | Return results or guess budget/age from nothing |
| 9 | edge | `"something affordable for any child"` | `clarification_needed` | `intent.budget_aed = null`. "affordable" is not converted to a number | Infer `budget_aed` from the word "affordable" or "cheap" |
| 10 | adversarial | `"gift for my dog"` | `null` | `confidence < 0.3`. `null_reason` explains this is a baby/mother platform | Return baby products as gifts for a dog |
| 11 | adversarial | `"what is the capital of France"` | `null` | Completely out of scope. `null_reason` is non-empty | Attempt to answer the question or return any products |
| 12 | edge | `"gift for a 6-month-old"` | `clarification_needed` | Age is extracted (6 months) but `budget_aed = null`. Asks for budget | Return results without knowing the budget |
| 13 | adversarial | *(60-word rambling query with budget ~200 AED and age ~6 months embedded)* | `results` | Intent extractor successfully parses budget=200, age=6 despite noise | Fail to parse, return a 422 validation error, or raise a 500 |
| 14 | easy | `"musical toy for toddler under 200 AED"` | `results` | All products ≤ 200 AED. Every card has non-empty `grounded_in` | Return a gift card with an empty `grounded_in` field |
| 15 | edge | `"gift for newborn twins, budget 400 AED total"` | `results` | System handles ambiguous quantity gracefully without crashing | Crash, return a 500, or raise an unhandled exception |

---

## How to Run

```bash
# Prerequisites: API server must be running on localhost:8000
cd backend
python evals/evals.py
```

The harness prints a row-by-row pass/fail table and a final score:

```
Mumzgift Eval Runner — 15 test cases

ID   Type         Status   Result   Detail
--------------------------------------------------------------------------------
1    easy         results  PASS
2    easy         clarif.. PASS
...
--------------------------------------------------------------------------------

Score: 15/15 (100%)
```

---

## Results

| Category | Cases | Score |
|----------|-------|-------|
| easy | 1, 2, 3, 4, 14 | 5 / 5 |
| arabic | 5, 6 | 2 / 2 |
| adversarial | 7, 10, 11, 13 | 4 / 4 |
| edge | 8, 9, 12, 15 | 4 / 4 |
| **Total** | **15** | **15 / 15** |

---

## Named Failure Modes

These are failure modes the system is designed to catch. Some are fully automated; one requires human review.

### 1. Budget inference from vague language
**What:** The LLM infers a numeric `budget_aed` from words like "affordable" or "cheap".
**Why it matters:** Budget filtering in Pinecone is a hard constraint. A hallucinated budget silently changes which products the user sees.
**Mitigation:** The intent extractor prompt explicitly states: *"NEVER infer budget_aed from words like affordable, cheap, or inexpensive."*
**Caught by:** Eval #9 (automated — checks `intent.budget_aed is null` when input contains "affordable").

### 2. Out-of-scope hallucination
**What:** The LLM returns baby products in response to a query that has nothing to do with babies (e.g. "gift for my dog").
**Why it matters:** A low-confidence, off-topic query should produce a clear refusal, not a list of irrelevant products.
**Mitigation:** The first guard in `rank_gifts()` checks `confidence < 0.3` with no budget/age before touching the retrieved set.
**Caught by:** Evals #10 and #11 (automated — checks `status = null`).

### 3. Empty grounded_in citation
**What:** The LLM omits the `grounded_in` field or returns an empty string, breaking the RAG guarantee.
**Why it matters:** An empty citation means the recommendation is not grounded in the retrieved product — the core promise of RAG is violated.
**Mitigation:** Pydantic `field_validator` on `GiftCard.grounded_in` raises a `ValidationError` (HTTP 422) if the field is empty. FastAPI surfaces this with field-level detail.
**Caught by:** Eval #14 (automated — checks all returned cards have non-empty `grounded_in`).

### 4. Arabic as structural translation
**What:** `reason_ar` mirrors the English sentence structure word-for-word rather than reading as native Gulf Arabic.
**Why it matters:** The value proposition for Arabic-speaking users in the GCC is native-quality copy, not a mechanical translation.
**Mitigation:** Ranker prompt explicitly instructs: *"Write reason_ar as native Gulf Arabic — NOT a word-for-word translation of reason_en."*
**Caught by:** Eval #5 — but **requires human review** to score accurately. The automated check only verifies `reason_ar` is non-empty.

### 5. Budget violation
**What:** A product above the stated budget appears in the results.
**Why it matters:** Returning an out-of-budget product is a direct trust failure for a shopping tool.
**Mitigation:** Pinecone pre-filters on `price_aed <= budget_aed` before the LLM sees any results. The LLM cannot recommend a product that wasn't retrieved.
**Caught by:** Evals #1, #3, #4, #6 (automated — checks all `gift.price_aed <= intent.budget_aed`).

### 6. Parser failure on long/noisy queries
**What:** A verbose, rambling query causes the intent extractor to return malformed JSON or miss key fields.
**Why it matters:** Real user voice queries are often noisy and long. The pipeline must be robust.
**Mitigation:** `_parse_json()` strips markdown fences before parsing. Pydantic defaults handle optional fields gracefully.
**Caught by:** Eval #13 (automated — verifies `status = results` and no HTTP 422/500).

---

## Honest Assessment

- **Cases 1–15 all pass** in automated testing with the current Groq Llama 3.3 70B backend.
- **Case 5 (Arabic copy quality)** is the weakest automated check — it only verifies `reason_ar` is non-empty. True native Gulf Arabic quality requires human review. Llama 3.3 70B produces good MSA (Modern Standard Arabic) but is less idiomatic in Gulf dialect than the originally planned Qwen2.5-72B.
- **Case 15 (twins budget)** passes by not crashing, but the budget interpretation (200 per child vs 400 total) is left to the LLM and is non-deterministic.
- The eval harness **requires a live server** — there are no unit tests for individual pipeline stages. This is a known gap; integration evals were prioritised given the time constraint.
