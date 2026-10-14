import type { ScoredCompany } from "@/lib/types";

export function ScoreBadge({
  score,
  grade,
}: {
  score: number;
  grade: ScoredCompany["grade"];
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="display text-4xl font-bold leading-none tabular-nums tracking-tight">
        {score}
      </span>
      <span className="text-sm font-bold text-[var(--muted)]">{grade}</span>
    </div>
  );
}
