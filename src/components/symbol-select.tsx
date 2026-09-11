import { NativeSelect } from "@/components/ui/input";
import { SYMBOLS } from "@/lib/market/symbols";

export function SymbolSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <NativeSelect className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {SYMBOLS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label} — {s.name}
        </option>
      ))}
    </NativeSelect>
  );
}
