import type { ReactNode } from "react";

export function PageHead({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-4 py-5 sm:px-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{kicker}</div>
        <h1 className="font-display mt-1 text-2xl tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}
