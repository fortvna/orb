const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdFine = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function fmtUsd(n: number, fine = false): string {
  return (fine || Math.abs(n) < 100 ? usdFine : usd).format(n);
}

export function fmtSignedUsd(n: number): string {
  const abs = fmtUsd(Math.abs(n), Math.abs(n) < 1000);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs.replace("-", "")}`;
  return abs;
}

export function fmtPx(n: number, digits: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n: number, digits = 1): string {
  const v = (n * 100).toFixed(digits);
  return n > 0 ? `+${v}%` : `${v}%`;
}

export function fmtRate(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtR(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${n.toFixed(2)}R`;
}

export function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function fmtTimeNy(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function fmtDateNy(unix: number | string): string {
  const d = typeof unix === "string" ? new Date(`${unix}T16:00:00-04:00`) : new Date(unix * 1000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export function weekdayName(n: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n] ?? "";
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
