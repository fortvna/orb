import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "The desk hit a snag. Reload and it should come back.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-fg">
      <span className="text-short" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl tracking-tight">Desk needs a refresh</h1>
      <p className="max-w-md text-sm break-words text-muted">{errorMessage(error)}</p>
      <button
        type="button"
        className="rounded-md bg-fg px-4 py-2 text-sm text-bg"
        onClick={() => {
          window.location.assign(window.location.pathname + window.location.search);
        }}
      >
        Reload
      </button>
    </main>
  );
}
