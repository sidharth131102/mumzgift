import type { Currency, GiftCard, Language } from "@/types";
import ProductCard from "./ProductCard";

interface Props {
  gifts: GiftCard[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  language: Language;
  currency: Currency;
}

export default function ProductGrid({ gifts, selected, onToggle, language, currency }: Props) {
  const selectionDisabled = selected.size >= 3;

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {gifts.map((gift) => (
        <ProductCard
          key={gift.product_id}
          product={gift}
          selected={selected.has(gift.product_id)}
          onToggle={() => onToggle(gift.product_id)}
          language={language}
          currency={currency}
          selectionDisabled={selectionDisabled}
        />
      ))}
    </div>
  );
}
