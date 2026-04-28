import type { GiftIntent } from "@/types";

interface Props {
  intent: GiftIntent | null;
}

export default function IntentStrip({ intent }: Props) {
  if (!intent) return null;

  const pills: { label: string; color: string }[] = [];

  if (intent.budget_aed !== null) {
    const cur = intent.currency ?? "AED";
    // show the budget in the user's original currency
    let budgetLabel = `Budget: ${intent.budget_aed} AED`;
    if (cur === "USD") budgetLabel = `Budget: $${(intent.budget_aed / 3.67).toFixed(0)} USD (${intent.budget_aed} AED)`;
    if (cur === "INR") budgetLabel = `Budget: ₹${(intent.budget_aed / 0.044).toLocaleString("en-IN", { maximumFractionDigits: 0 })} INR (${intent.budget_aed} AED)`;
    pills.push({ label: budgetLabel, color: "bg-emerald-100 text-emerald-700 border-emerald-200" });
  }
  if (intent.baby_age_months !== null) {
    pills.push({ label: `Age: ${intent.baby_age_months} months`, color: "bg-sky-100 text-sky-700 border-sky-200" });
  }
  if (intent.occasion) {
    pills.push({ label: intent.occasion, color: "bg-purple-100 text-purple-700 border-purple-200" });
  }
  for (const tag of intent.tags) {
    pills.push({ label: tag, color: "bg-gray-100 text-gray-600 border-gray-200" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Understood:</span>
      {pills.map((p) => (
        <span
          key={p.label}
          className={`rounded-full border px-3 py-0.5 text-xs font-medium ${p.color}`}
        >
          {p.label}
        </span>
      ))}
      {intent.missing_info.length > 0 && (
        <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-700">
          Missing: {intent.missing_info.join(", ")}
        </span>
      )}
      <span className="ml-auto text-xs text-gray-400">
        Confidence: {Math.round(intent.confidence * 100)}%
      </span>
    </div>
  );
}
