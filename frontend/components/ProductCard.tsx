import type { Currency, GiftCard, Language } from "@/types";

interface Props {
  product: GiftCard;
  selected: boolean;
  onToggle: () => void;
  language: Language;
  currency: Currency;
  selectionDisabled: boolean;
}

function formatPrice(product: GiftCard, currency: Currency): string {
  if (currency === "USD") return `$${product.price_usd.toFixed(2)}`;
  if (currency === "INR") return `₹${product.price_inr.toLocaleString("en-IN")}`;
  return `${product.price_aed} AED`;
}

const CARD_ACCENTS = [
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
  "from-sky-400 to-blue-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
];

export default function ProductCard({ product, selected, onToggle, language, currency, selectionDisabled }: Props) {
  const isAr = language === "ar";
  const name = isAr ? product.name_ar : product.name_en;
  const reason = isAr ? product.reason_ar : product.reason_en;
  const confidencePct = Math.round(product.confidence * 100);
  const displayPrice = formatPrice(product, currency);
  const accent = CARD_ACCENTS[product.product_id % CARD_ACCENTS.length];

  const barColor =
    product.confidence >= 0.8
      ? "bg-emerald-500"
      : product.confidence >= 0.6
      ? "bg-amber-400"
      : "bg-red-400";

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 ${
        selected
          ? "border-emerald-300 ring-2 ring-emerald-100 shadow-emerald-100"
          : "border-gray-100 hover:border-rose-200 hover:shadow-md hover:shadow-rose-50"
      }`}
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Colored top accent */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />

      <div className="flex flex-col flex-1 p-5">
        {/* Selected badge */}
        {selected && (
          <div className="absolute right-4 top-5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {/* Name */}
        <h3 className="mb-3 text-sm font-semibold leading-snug text-gray-900 pr-7">{name}</h3>

        {/* Price + age */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-rose-50 px-3 py-0.5 text-sm font-bold text-rose-600 border border-rose-100">
            {displayPrice}
          </span>
          {currency !== "AED" && (
            <span className="text-xs text-gray-400">{product.price_aed} AED</span>
          )}
          <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500 border border-gray-100">
            {product.age_range}
          </span>
        </div>

        {/* Reason */}
        <p className="mb-4 text-xs leading-relaxed text-gray-600 flex-1">{reason}</p>

        {/* Tags */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {product.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {tag}
            </span>
          ))}
        </div>

        {/* Match score */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-gray-400">Match score</span>
            <span className={`font-semibold ${confidencePct >= 80 ? "text-emerald-600" : confidencePct >= 60 ? "text-amber-600" : "text-red-500"}`}>
              {confidencePct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${confidencePct}%` }} />
          </div>
        </div>

        {/* Source */}
        <details className="mb-4 text-xs text-gray-400">
          <summary className="cursor-pointer select-none hover:text-gray-600">Source</summary>
          <p className="mt-1 rounded-xl bg-gray-50 p-2.5 leading-relaxed italic text-gray-500">{product.grounded_in}</p>
        </details>

        {/* Compare button */}
        <button
          onClick={onToggle}
          disabled={selectionDisabled && !selected}
          className={`w-full rounded-xl py-2 text-xs font-semibold transition-all ${
            selected
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
              : "bg-gray-50 text-gray-600 hover:bg-rose-50 hover:text-rose-700 border border-gray-200 hover:border-rose-200"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {selected ? "✓ Selected" : "Select to compare"}
        </button>
      </div>
    </div>
  );
}
