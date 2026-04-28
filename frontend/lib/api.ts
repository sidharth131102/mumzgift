import type {
  CompareResponse,
  Language,
  SearchResponse,
  TranscribeResponse,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function searchGifts(
  query: string,
  language: Language
): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, language }),
  });
  return handleResponse<SearchResponse>(res);
}

export async function transcribeAudio(
  audioBlob: Blob,
  filename: string
): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append("audio", audioBlob, filename);
  const res = await fetch(`${BASE}/api/transcribe`, {
    method: "POST",
    body: form,
  });
  return handleResponse<TranscribeResponse>(res);
}

export async function compareProducts(
  productIds: number[]
): Promise<CompareResponse> {
  const res = await fetch(`${BASE}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_ids: productIds }),
  });
  return handleResponse<CompareResponse>(res);
}
