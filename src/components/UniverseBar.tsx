"use client";

import { useRef, useState } from "react";
import type { Company, IngestStats } from "@/lib/types";

type Props = {
  universeSize: number;
  sourceLabel: string;
  stats: IngestStats | null;
  onIngest: (companies: Company[], stats: IngestStats, label: string) => void;
  onReset: () => void;
  isImported: boolean;
};

export function UniverseBar({
  universeSize,
  sourceLabel,
  stats,
  onIngest,
  onReset,
  isImported,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingestText(csv: string, label: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingest failed");
      onIngest(data.companies, data.stats, label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    await ingestText(text, file.name);
  }

  async function loadSample() {
    const res = await fetch("/sample-saasquatch-export.csv");
    if (!res.ok) {
      setError("Could not load the sample list.");
      return;
    }
    await ingestText(await res.text(), "sample SaaSquatch export");
  }

  return (
    <div className="w-full min-w-0 lg:w-auto lg:text-right">
      <p className="text-sm text-[var(--muted)]">
        <span className="display text-lg font-bold tabular-nums text-[var(--ink)]">
          {universeSize}
        </span>{" "}
        companies · {sourceLabel}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 lg:justify-end">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="btn btn-solid btn-grow sm:flex-none"
        >
          {busy ? "Importing…" : "Import CSV"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadSample()}
          className="btn btn-line btn-grow sm:flex-none"
        >
          Load sample
        </button>
        {isImported && (
          <button
            type="button"
            disabled={busy}
            onClick={onReset}
            className="btn btn-quiet"
          >
            Reset list
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-[var(--muted)] lg:text-right">
        SaaSquatch CSV export works best
      </p>

      {error && (
        <p className="mt-2 text-sm text-[var(--danger)] lg:text-right">
          {error}
        </p>
      )}

      {stats && (
        <p className="mt-2 text-xs text-[var(--muted)] lg:text-right">
          {stats.rows} rows · {stats.unique} unique · {stats.duplicatesCollapsed}{" "}
          dupes · {stats.readyToCall} ready
        </p>
      )}
    </div>
  );
}
