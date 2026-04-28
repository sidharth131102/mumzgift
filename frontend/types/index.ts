export type Language = "en" | "ar";
export type Currency = "AED" | "USD" | "INR";

export interface GiftIntent {
  budget_aed: number | null;
  currency: Currency;
  baby_age_months: number | null;
  occasion: string | null;
  tags: string[];
  language: Language;
  confidence: number;
  missing_info: string[];
}

export interface GiftCard {
  product_id: number;
  name_en: string;
  name_ar: string;
  price_aed: number;
  price_usd: number;
  price_inr: number;
  age_range: string;
  reason_en: string;
  reason_ar: string;
  confidence: number;
  grounded_in: string;
  tags: string[];
  occasion: string[];
}

export type SearchStatus = "results" | "null" | "clarification_needed";

export interface SearchResponse {
  status: SearchStatus;
  intent: GiftIntent;
  gifts: GiftCard[];
  null_reason: string | null;
  clarification_question: string | null;
}

export interface CompareResponse {
  products: GiftCard[];
  best_value_id: number;
  best_match_id: number;
}

export interface TranscribeResponse {
  transcript: string;
  language: Language;
  confidence: number | null;
}
