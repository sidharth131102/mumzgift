"""
Run: python evals/evals.py

Runs all 15 test cases against the live FastAPI server at http://localhost:8000.
Prints a pass/fail table with named failure modes and a final score.
"""

import json
import sys
from pathlib import Path

import httpx

BASE_URL = "http://localhost:8000"
TEST_CASES_PATH = Path(__file__).parent / "test_cases.json"


def check_case(case: dict, response: dict) -> tuple[bool, str]:
    expected = case["expected_status"]
    actual_status = response.get("status")
    must_not = case.get("must_not", "")
    intent = response.get("intent", {})
    gifts = response.get("gifts", [])

    if actual_status != expected:
        return False, f"Expected status={expected!r}, got {actual_status!r}"

    if actual_status == "results":
        for gift in gifts:
            if not gift.get("grounded_in", "").strip():
                return False, f"product_id={gift.get('product_id')} has empty grounded_in"

            budget = intent.get("budget_aed")
            if budget is not None and gift.get("price_aed", 0) > budget:
                return False, (
                    f"product_id={gift.get('product_id')} price {gift.get('price_aed')} "
                    f"exceeds budget {budget} — violates: {must_not}"
                )

        if case["type"] == "arabic" or intent.get("language") == "ar":
            for gift in gifts:
                if not gift.get("reason_ar", "").strip():
                    return False, f"product_id={gift.get('product_id')} has empty reason_ar"

    if actual_status == "null":
        if not response.get("null_reason", "").strip():
            return False, "null_reason is empty — must explain why no results"

    if actual_status == "clarification_needed":
        if not response.get("clarification_question", "").strip():
            return False, "clarification_question is empty"

        if "budget_aed" in intent.get("missing_info", []):
            if intent.get("budget_aed") is not None:
                return False, f"budget_aed should be null but got {intent.get('budget_aed')}"

    # check affordable/vague budget cases
    if "affordable" in case["input"].lower() or "cheap" in case["input"].lower():
        if intent.get("budget_aed") is not None:
            return False, f"Inferred budget_aed={intent.get('budget_aed')} from vague language — violates: {must_not}"

    return True, "PASS"


def run_evals() -> None:
    with open(TEST_CASES_PATH, encoding="utf-8") as f:
        test_cases = json.load(f)

    print(f"\nMumzgift Eval Runner — {len(test_cases)} test cases\n")
    print(f"{'ID':<4} {'Type':<12} {'Status':<8} {'Result':<8} {'Detail'}")
    print("-" * 80)

    passed = 0
    results = []

    for case in test_cases:
        cid = case["id"]
        ctype = case["type"]

        try:
            res = httpx.post(
                f"{BASE_URL}/api/search",
                json={"query": case["input"], "language": "en"},
                timeout=60.0,
            )
            if res.status_code not in (200, 422):
                result = False
                detail = f"HTTP {res.status_code}: {res.text[:120]}"
                response = {}
            else:
                response = res.json()
                result, detail = check_case(case, response)
        except httpx.ConnectError:
            result = False
            detail = "Connection refused — is the server running on :8000?"
            response = {}
        except Exception as e:
            result = False
            detail = f"Error: {e}"
            response = {}

        mark = "PASS" if result else "FAIL"
        status = response.get("status", "—")
        print(f"{cid:<4} {ctype:<12} {status:<8} {mark:<8} {detail}")
        results.append(result)
        if result:
            passed += 1

    score = passed / len(test_cases) * 100
    print("-" * 80)
    print(f"\nScore: {passed}/{len(test_cases)} ({score:.0f}%)\n")

    if passed < len(test_cases):
        failed = [str(test_cases[i]["id"]) for i, r in enumerate(results) if not r]
        print(f"Failed case IDs: {', '.join(failed)}\n")

    sys.exit(0 if passed == len(test_cases) else 1)


if __name__ == "__main__":
    run_evals()
