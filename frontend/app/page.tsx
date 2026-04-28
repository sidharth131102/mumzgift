"use client";

import { useState } from "react";
import { compareProducts, searchGifts, transcribeAudio } from "@/lib/api";
import type {
  CompareResponse,
  Currency,
  GiftCard,
  GiftIntent,
  Language,
  SearchStatus,
} from "@/types";

import ClarifyPrompt from "@/components/ClarifyPrompt";
import CompareTable from "@/components/CompareTable";
import IntentStrip from "@/components/IntentStrip";
import NullState from "@/components/NullState";
import ProductGrid from "@/components/ProductGrid";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [intent, setIntent] = useState<GiftIntent | null>(null);
  const [gifts, setGifts] = useState<GiftCard[]>([]);
  const [status, setStatus] = useState<SearchStatus | null>(null);
  const [nullReason, setNullReason] = useState<string | null>(null);
  const [clarifyQ, setClarifyQ] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [transcript, setTranscript] = useState<string | undefined>(undefined);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [compareResponse, setCompareResponse] = useState<CompareResponse | null>(null);
  const [comparing, setComparing] = useState(false);

  const isRtl = language === "ar";

  async function handleSearch(query: string) {
    setLoading(true);
    setError(null);
    setGifts([]);
    setIntent(null);
    setStatus(null);
    setNullReason(null);
    setClarifyQ(null);
    setSelected(new Set());
    setCompareResponse(null);
    setLastQuery(query);

    try {
      const res = await searchGifts(query, language);
      setIntent(res.intent);
      setStatus(res.status);
      setGifts(res.gifts);
      setNullReason(res.null_reason);
      setClarifyQ(res.clarification_question);
      if (res.intent.language && res.intent.language !== language) {
        setLanguage(res.intent.language as Language);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleTranscribe(blob: Blob, filename: string) {
    setLoading(true);
    setError(null);
    try {
      const { transcript: text, language: detectedLang } = await transcribeAudio(blob, filename);
      if (detectedLang) setLanguage(detectedLang as Language);
      setTranscript(text);
      await handleSearch(text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transcription failed");
      setLoading(false);
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
    setCompareResponse(null);
  }

  async function handleCompare() {
    if (selected.size < 2) return;
    setComparing(true);
    setError(null);
    try {
      const res = await compareProducts(Array.from(selected));
      setCompareResponse(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setComparing(false);
    }
  }

  const hasResults = status === "results" && gifts.length > 0 && !loading;

  return (
    <div className="min-h-screen" dir={isRtl ? "rtl" : "ltr"}>
      {/* Top nav */}
      <header className="sticky top-0 z-10 border-b border-white/60 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🎁</span>
            <div>
              <span className="text-base font-bold text-gray-900">
                {isRtl ? "مامزجفت" : "Mumzgift"}
              </span>
              <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">
                AI
              </span>
            </div>
          </div>
          <button
            onClick={() => setLanguage(isRtl ? "en" : "ar")}
            className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition hover:border-rose-300 hover:text-rose-600"
          >
            {isRtl ? "English" : "عربي"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">
        {/* Hero */}
        <div className="py-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {isRtl
              ? "اعثر على الهدية المثالية بالذكاء الاصطناعي"
              : "Find the perfect baby gift"}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {isRtl
              ? "صف ما تبحث عنه وسيجد الذكاء الاصطناعي أفضل الهدايا لك"
              : "Describe who it's for and our AI will pick the best gifts from Mumzworld"}
          </p>
        </div>

        {/* Search card */}
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-white bg-white/80 p-5 shadow-xl shadow-rose-100/40 backdrop-blur-sm">
            <SearchBar
              onSearch={handleSearch}
              onTranscribe={handleTranscribe}
              language={language}
              loading={loading}
              transcript={transcript}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mx-auto mt-6 flex max-w-3xl items-center gap-3 rounded-2xl border border-rose-100 bg-white px-5 py-4 shadow-sm">
            <svg className="h-5 w-5 animate-spin text-rose-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm text-gray-500">Finding the best gifts…</span>
          </div>
        )}

        {/* Intent strip */}
        {intent && !loading && (
          <div className="mx-auto mt-4 max-w-3xl">
            <IntentStrip intent={intent} />
          </div>
        )}

        {/* Clarification */}
        {status === "clarification_needed" && clarifyQ && !loading && (
          <div className="mx-auto mt-6 max-w-3xl">
            <ClarifyPrompt question={clarifyQ} originalQuery={lastQuery} onAnswer={handleSearch} />
          </div>
        )}

        {/* Null state */}
        {status === "null" && nullReason && !loading && (
          <div className="mx-auto mt-6 max-w-3xl">
            <NullState reason={nullReason} />
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                <span className="font-bold text-gray-800">{gifts.length}</span>{" "}
                {gifts.length === 1 ? "gift" : "gifts"} found
              </p>
              {selected.size >= 2 && (
                <button
                  onClick={handleCompare}
                  disabled={comparing}
                  className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-50"
                >
                  {comparing && (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  Compare {selected.size} selected
                </button>
              )}
            </div>

            <ProductGrid
              gifts={gifts}
              selected={selected}
              onToggle={toggleSelect}
              language={language}
              currency={(intent?.currency ?? "AED") as Currency}
            />

            {selected.size > 0 && (
              <p className="mt-3 text-center text-xs text-gray-400">
                {selected.size}/3 selected —{" "}
                {3 - selected.size > 0
                  ? `select ${3 - selected.size} more to compare`
                  : "click Compare to see side-by-side"}
              </p>
            )}
          </div>
        )}

        {/* Compare table */}
        {compareResponse && !comparing && (
          <div className="mt-10">
            <h2 className="mb-4 text-base font-semibold text-gray-800">
              {isRtl ? "مقارنة المنتجات" : "Product Comparison"}
            </h2>
            <CompareTable
              products={compareResponse.products}
              compareResponse={compareResponse}
              language={language}
              currency={(intent?.currency ?? "AED") as Currency}
            />
          </div>
        )}
      </main>
    </div>
  );
}
