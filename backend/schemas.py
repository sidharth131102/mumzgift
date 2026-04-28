from pydantic import BaseModel, field_validator
from typing import Optional, Literal
from enum import Enum


class Language(str, Enum):
    EN = "en"
    AR = "ar"


class Currency(str, Enum):
    AED = "AED"
    USD = "USD"
    INR = "INR"


class GiftIntent(BaseModel):
    budget_aed: Optional[float] = None   # always normalised to AED for filtering
    currency: Currency = Currency.AED    # currency the user queried in (for display)
    baby_age_months: Optional[int] = None
    occasion: Optional[str] = None
    tags: list[str] = []
    language: Language = Language.EN
    confidence: float
    missing_info: list[str] = []

    @field_validator("confidence")
    @classmethod
    def confidence_in_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("confidence must be between 0.0 and 1.0")
        return v


class GiftCard(BaseModel):
    product_id: int
    name_en: str
    name_ar: str
    price_aed: float
    price_usd: float = 0.0
    price_inr: float = 0.0
    age_range: str
    reason_en: str
    reason_ar: str
    confidence: float
    grounded_in: str
    tags: list[str]
    occasion: list[str]

    @field_validator("grounded_in")
    @classmethod
    def grounded_in_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "grounded_in cannot be empty. "
                "Every recommendation must cite the source product document chunk."
            )
        return v

    @field_validator("reason_ar")
    @classmethod
    def reason_ar_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason_ar cannot be empty — Arabic reason is required")
        return v

    @field_validator("reason_en")
    @classmethod
    def reason_en_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason_en cannot be empty — English reason is required")
        return v


class SearchRequest(BaseModel):
    query: str
    language: Language = Language.EN


class SearchResponse(BaseModel):
    status: Literal["results", "null", "clarification_needed"]
    intent: GiftIntent
    gifts: list[GiftCard] = []
    null_reason: Optional[str] = None
    clarification_question: Optional[str] = None


class CompareRequest(BaseModel):
    product_ids: list[int]


class CompareResponse(BaseModel):
    products: list[GiftCard]
    best_value_id: int
    best_match_id: int


class TranscribeResponse(BaseModel):
    transcript: str
    language: Language
    confidence: Optional[float] = None
