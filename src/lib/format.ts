export function formatRevenue(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function parseList(value: string): string[] {
  return value
    .split(/[,|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function listToString(values: string[]): string {
  return values.join(", ");
}

export function formatEmployees(n: number | null): string {
  if (n == null) return "-";
  return `${n} employees`;
}

export function formatFounded(year: number | null, now = 2026): string {
  if (year == null) return "-";
  const age = Math.max(0, now - year);
  return `${year} · ${age} yr`;
}
