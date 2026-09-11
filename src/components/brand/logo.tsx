import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-7", className)}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 16.5h16" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M8 12.5h7.5M16.5 19.5H24" stroke="currentColor" strokeWidth="1.2" />
      <path d="M22.2 9.2 24.8 8l-.6 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M20.4 12.2 24.8 8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function Logo({ className, word = true }: { className?: string; word?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <LogoMark />
      {word ? (
        <span className="font-display text-xl font-medium tracking-tight">Orb</span>
      ) : null}
    </span>
  );
}
