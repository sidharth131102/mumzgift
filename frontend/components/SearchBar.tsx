"use client";

import { useEffect, useRef, useState } from "react";
import type { Language } from "@/types";

interface Props {
  onSearch: (query: string) => void;
  onTranscribe: (file: Blob, filename: string) => void;
  language: Language;
  loading: boolean;
  transcript?: string;
}

const QUICK_FILLS = [
  "Thoughtful gift for a 6-month-old under 200 AED",
  "Educational toy for a 1-year-old, budget 150 AED",
  "Newborn baby shower gift under 300 AED",
  "هدية لطفل عمره 6 أشهر بأقل من 200 درهم",
  "هدية تعليمية للأطفال الصغار، الميزانية 250 درهم",
];

export default function SearchBar({ onSearch, onTranscribe, language, loading, transcript }: Props) {
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (transcript) setQuery(transcript);
  }, [transcript]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRtl = language === "ar";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim() && !loading) onSearch(query.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (query.trim() && !loading) onSearch(query.trim());
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onTranscribe(blob, "recording.webm");
        setRecording(false);
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      alert("Microphone access is required for voice search.");
    }
  }

  return (
    <div className="w-full space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRtl
              ? "اكتب ما تبحث عنه... مثال: هدية لطفل عمره 6 أشهر بأقل من 200 درهم"
              : "Describe what you're looking for... e.g. gift for a 6-month-old under 200 AED"
          }
          disabled={loading}
          rows={2}
          dir={isRtl ? "rtl" : "ltr"}
          className={`w-full resize-none rounded-2xl border-0 bg-gray-50 px-5 py-3.5 pr-28 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-rose-200 disabled:opacity-50 ${isRtl ? "text-right pl-28 pr-5" : ""}`}
        />

        <div className={`absolute bottom-3 ${isRtl ? "left-3" : "right-3"} flex items-center gap-2`}>
          <button
            type="button"
            onClick={toggleRecording}
            disabled={loading}
            title={recording ? "Stop recording" : "Voice search"}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              recording
                ? "animate-pulse bg-red-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-rose-100 hover:text-rose-600"
            } disabled:opacity-40`}
          >
            {recording ? (
              <span className="h-3 w-3 rounded-sm bg-white" />
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 11a1 1 0 0 1 1 1 7.5 7.5 0 0 1-15 0 1 1 0 1 1 2 0 5.5 5.5 0 0 0 11 0 1 1 0 0 1 1-1zM11 20h2v2h-2v-2z" />
              </svg>
            )}
          </button>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex h-9 items-center gap-1.5 rounded-full bg-rose-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-40"
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            )}
            {isRtl ? "بحث" : "Search"}
          </button>
        </div>
      </form>

      <div className={`flex flex-wrap gap-1.5 ${isRtl ? "flex-row-reverse" : ""}`}>
        <span className="self-center text-xs text-gray-400 font-medium">Try:</span>
        {QUICK_FILLS.map((chip) => (
          <button
            key={chip}
            onClick={() => {
              setQuery(chip);
              onSearch(chip);
            }}
            disabled={loading}
            className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs text-rose-600 transition hover:bg-rose-100 hover:border-rose-200 disabled:opacity-40"
          >
            {chip.length > 40 ? chip.slice(0, 40) + "…" : chip}
          </button>
        ))}
      </div>
    </div>
  );
}
