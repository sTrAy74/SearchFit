"use client";

import { useCallback, useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { ShortlistTable } from "@/components/ShortlistTable";
import { UniverseBar } from "@/components/UniverseBar";
import { getCompanies } from "@/lib/companies";
import { scoredToCsv } from "@/lib/csv";
import { DEFAULT_THESIS, rankCompanies } from "@/lib/scoring";
import type {
  Company,
  IngestStats,
  ScoredCompany,
  ScoreResponse,
  Thesis,
} from "@/lib/types";

const SEED = getCompanies();

function scoreLocal(nextThesis: Thesis, nextCompanies: Company[]) {
  const ranked = rankCompanies(nextCompanies, nextThesis);
  return {
    results: ranked,
    totalScored: nextCompanies.length,
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

/** Keep existing excludes when AI returns none; otherwise union both. */
function mergeThesis(current: Thesis, incoming: Thesis): Thesis {
  const excludeKeywords =
    incoming.excludeKeywords.length > 0
      ? uniqueStrings([...current.excludeKeywords, ...incoming.excludeKeywords])
      : [...current.excludeKeywords];

  return {
    ...incoming,
    excludeKeywords,
    topN: incoming.topN || current.topN,
  };
}

const INITIAL = scoreLocal(DEFAULT_THESIS, SEED);

export default function HomePage() {
  const [thesis, setThesis] = useState<Thesis>(DEFAULT_THESIS);
  const [universe, setUniverse] = useState<Company[] | null>(null);
  const [sourceLabel, setSourceLabel] = useState("sample list");
  const [ingestStats, setIngestStats] = useState<IngestStats | null>(null);
  const [results, setResults] = useState<ScoredCompany[]>(INITIAL.results);
  const [totalScored, setTotalScored] = useState<number | null>(
    INITIAL.totalScored
  );
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companies = universe ?? SEED;

  const applyScore = useCallback(
    (nextThesis: Thesis, nextCompanies: Company[]) => {
      const scored = scoreLocal(nextThesis, nextCompanies);
      setResults(scored.results);
      setTotalScored(scored.totalScored);
    },
    []
  );

  const runScore = useCallback(
    async (
      nextThesis: Thesis = thesis,
      nextCompanies: Company[] = companies,
      opts?: { announce?: boolean }
    ) => {
      setLoading(true);
      setError(null);
      try {
        // Prefer local score for snappy filter → review loop; API stays for import parity.
        applyScore(nextThesis, nextCompanies);
        let rankedCount = nextCompanies.length;
        const usingSeed = nextCompanies === SEED;
        if (!usingSeed) {
          const res = await fetch("/api/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thesis: nextThesis,
              companies: nextCompanies,
            }),
          });
          if (!res.ok) throw new Error("Scoring failed");
          const data = (await res.json()) as ScoreResponse;
          setResults(data.results);
          setTotalScored(data.totalScored);
          rankedCount = data.totalScored;
        }
        if (opts?.announce) {
          setNotice(
            `Rescored ${rankedCount} companies with your current filters.`
          );
        }
      } catch {
        setError("Could not score companies. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [thesis, companies, applyScore]
  );

  function handleExport(rows: ScoredCompany[]) {
    setExporting(true);
    setError(null);
    try {
      const csv = scoredToCsv(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "searchfit-shortlist.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("CSV export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function handleAiThesis(prompt: string) {
    setAiLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, current: thesis }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI ICP parse failed");
      const nextThesis = mergeThesis(thesis, data.thesis as Thesis);
      setThesis(nextThesis);
      setAiSummary(data.summary ?? "Profile applied to this list.");
      if (data.notice) setNotice(data.notice);
      await runScore(nextThesis, companies);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read that profile. Check GEMINI_API_KEY or edit the filters."
      );
    } finally {
      setAiLoading(false);
    }
  }

  function handleIngest(
    next: Company[],
    stats: IngestStats,
    label: string
  ) {
    setUniverse(next);
    setIngestStats(stats);
    setSourceLabel(label);
    setResults([]);
    setTotalScored(null);
    setNotice(
      `Loaded ${stats.unique} companies (${stats.duplicatesCollapsed} duplicates merged). Ranked with your current filters.`
    );
    void runScore(thesis, next);
  }

  function handleReset() {
    setUniverse(null);
    setIngestStats(null);
    setSourceLabel("sample list");
    setResults([]);
    setTotalScored(null);
    setNotice(null);
    void runScore(thesis, SEED);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-6 lg:px-8 xl:px-10">
      <header className="animate-rise mb-5 sm:mb-6">
        <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
          <div className="min-w-0">
            <p className="display text-[clamp(2.1rem,7vw,3.75rem)] font-bold leading-[0.95] tracking-tight">
              SearchFit
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)] sm:mt-3 sm:text-base">
              Rank your lead list, then decide Call, Enrich, or Skip before you
              spend a credit.
            </p>
          </div>
          <UniverseBar
            universeSize={companies.length}
            sourceLabel={sourceLabel}
            stats={ingestStats}
            onIngest={handleIngest}
            onReset={handleReset}
            isImported={universe != null}
          />
        </div>
      </header>

      <div className="space-y-5 sm:space-y-6">
        {notice && (
          <div className="animate-rise flex items-start justify-between gap-3 border-l-4 border-[var(--yellow)] bg-white px-4 py-3 text-sm text-[var(--ink)]">
            <p>{notice}</p>
            <button
              type="button"
              className="shrink-0 text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)]"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="animate-rise flex items-start justify-between gap-3 border-l-4 border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            <p>{error}</p>
            <button
              type="button"
              className="shrink-0 text-xs font-bold hover:underline"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <FilterBar
          thesis={thesis}
          onChange={(next) => {
            setThesis(next);
            applyScore(next, companies);
          }}
          onScore={() => void runScore(thesis, companies, { announce: true })}
          onAiThesis={handleAiThesis}
          loading={loading}
          aiLoading={aiLoading}
          aiSummary={aiSummary}
          onDismissSummary={() => setAiSummary(null)}
        />

        <ShortlistTable
          results={results}
          totalScored={totalScored}
          loading={loading}
          onExport={handleExport}
          exporting={exporting}
        />
      </div>

      <footer className="mt-8 border-t border-[var(--line)] pb-8 pt-5 text-xs leading-5 text-[var(--muted)] sm:mt-10 sm:text-sm">
        Set filters → review Call / Enrich / Skip → export. Describe in words
        fills filters; Generate email drafts outreach.
      </footer>
    </div>
  );
}
