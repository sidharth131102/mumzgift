import type { CompareResponse, Currency, GiftCard, Language } from "@/types";

interface Props {
  products: GiftCard[];
  compareResponse: CompareResponse;
  language: Language;
  currency: Currency;
}

function formatPrice(product: GiftCard, currency: Currency): string {
  if (currency === "USD") return `$${product.price_usd.toFixed(2)}`;
  if (currency === "INR") return `₹${product.price_inr.toLocaleString("en-IN")}`;
  return `${product.price_aed} AED`;
}

function priceLabel(currency: Currency): string {
  if (currency === "USD") return "Price (USD)";
  if (currency === "INR") return "Price (INR)";
  return "Price (AED)";
}

export default function CompareTable({ products, compareResponse, language, currency }: Props) {
  const { best_value_id, best_match_id } = compareResponse;

  const ROWS: { label: string; render: (p: GiftCard) => string; key: string }[] = [
    { key: "name",  label: "Name",          render: (p) => language === "ar" ? p.name_ar : p.name_en },
    { key: "price", label: priceLabel(currency), render: (p) => formatPrice(p, currency) },
    // always show AED as a secondary reference row when currency isn't AED
    ...(currency !== "AED"
      ? [{ key: "price_aed", label: "Price (AED)", render: (p: GiftCard) => `${p.price_aed} AED` }]
      : []),
    { key: "age",   label: "Age range",     render: (p) => p.age_range },
    { key: "score", label: "Match score",   render: (p) => `${Math.round(p.confidence * 100)}%` },
    { key: "why",   label: "Why it fits",   render: (p) => language === "ar" ? p.reason_ar : p.reason_en },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="w-28 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              Criteria
            </th>
            {products.map((p) => (
              <th key={p.product_id} className="px-5 py-3 text-left font-semibold text-gray-700">
                <div className="flex flex-col gap-1">
                  <span className="text-xs leading-snug">
                    {language === "ar" ? p.name_ar : p.name_en}
                  </span>
                  <div className="flex gap-1.5">
                    {p.product_id === best_value_id && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Best value
                      </span>
                    )}
                    {p.product_id === best_match_id && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                        Best match
                      </span>
                    )}
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, ri) => (
            <tr key={row.key} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
              <td className="whitespace-nowrap px-5 py-3 text-xs font-medium text-gray-400">
                {row.label}
              </td>
              {products.map((p) => {
                const isValueHighlight = row.key === "price" && p.product_id === best_value_id;
                const isMatchHighlight = row.key === "score" && p.product_id === best_match_id;
                return (
                  <td
                    key={p.product_id}
                    dir={language === "ar" && row.key === "why" ? "rtl" : "ltr"}
                    className={`px-5 py-3 align-top text-sm leading-relaxed text-gray-700 ${
                      isValueHighlight ? "font-semibold text-emerald-700" : ""
                    } ${isMatchHighlight ? "font-semibold text-sky-700" : ""}`}
                  >
                    {row.render(p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
