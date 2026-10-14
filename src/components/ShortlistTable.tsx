"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreBadge } from "@/components/ScoreBadge";
import {
  formatEmployees,
  formatFounded,
  formatRevenue,
} from "@/lib/format";
import { WEIGHTS } from "@/lib/scoring";
import type { ActionCounts, OutreachAction, ScoredCompany } from "@/lib/types";

type Props = {
  results: ScoredCompany[];
  totalScored: number | null;
  loading: boolean;
  onExport: (rows: ScoredCompany[]) => void;
  exporting: boolean;
};

const QUEUE: OutreachAction[] = ["call", "enrich", "skip"];

const ACTION_TONE: Record<OutreachAction, string> = {
  call: "text-[var(--call)]",
  enrich: "text-[var(--warn)]",
  skip: "text-[var(--muted)]",
};

const ACTION_BG: Record<OutreachAction, string> = {
  call: "bg-[var(--call-soft)] text-[var(--call)]",
  enrich: "bg-[var(--warn-soft)] text-[var(--warn)]",
  skip: "bg-[var(--bg-wash)] text-[var(--muted)]",
};

const ACTION_LABEL: Record<OutreachAction, string> = {
  call: "Call",
  enrich: "Enrich",
  skip: "Skip",
};

const OVERRIDE_REASON: Record<OutreachAction, string> = {
  call: "You marked this Call - ready for outreach.",
  enrich: "You marked this Enrich - spend a credit before outreach.",
  skip: "You marked this Skip - don't spend a credit here.",
};

function isAllQueue(actions: OutreachAction[]): boolean {
  return QUEUE.every((action) => actions.includes(action));
}

function cutLabel(actions: OutreachAction[]): string {
  if (isAllQueue(actions)) return "all";
  const labels = QUEUE.filter((action) => actions.includes(action)).map(
    (action) => ACTION_LABEL[action].toLowerCase()
  );
  if (labels.length <= 1) return labels[0] ?? "nothing";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function emptyViewMessage(
  queue: OutreachAction[],
  counts: ActionCounts | null
): string {
  if (!queue.length) {
    return "Turn on All, Call, Enrich, or Skip above to see companies.";
  }
  const hidden = QUEUE.filter(
    (action) => !queue.includes(action) && (counts?.[action] ?? 0) > 0
  );
  if (hidden.length) {
    return `Nothing in ${cutLabel(queue)} right now. Try All, or turn on ${cutLabel(hidden)}.`;
  }
  return "No companies match these filters. Widen industry, states, or revenue.";
}

export function ShortlistTable({
  results,
  totalScored,
  loading,
  onExport,
  exporting,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queue, setQueue] = useState<OutreachAction[]>(["call", "enrich"]);
  const [overrides, setOverrides] = useState<Record<string, OutreachAction>>(
    {}
  );
  const detailRef = useRef<HTMLDivElement>(null);

  const applied = useMemo(
    () =>
      results.map((row) => {
        const override = overrides[row.company.id];
        if (!override || override === row.action) return row;
        return {
          ...row,
          action: override,
          actionReason: OVERRIDE_REASON[override],
        };
      }),
    [results, overrides]
  );

  const counts = useMemo(() => countFromRows(applied), [applied]);
  // Show every match - no Top N cap on the review list.
  const visible = applied.filter((row) => queue.includes(row.action));
  const visibleIds = useMemo(
    () => visible.map((row) => row.company.id),
    [visible]
  );
  const resultKey = results.map((row) => row.company.id).join("|");

  // Keep selection valid without a blank detail flash when filters change.
  const effectiveId =
    selectedId && visibleIds.includes(selectedId)
      ? selectedId
      : (visibleIds[0] ?? null);

  useEffect(() => {
    if (effectiveId !== selectedId) {
      setSelectedId(effectiveId);
    }
  }, [effectiveId, selectedId]);

  // Drop overrides for companies that left the universe after import/reset.
  useEffect(() => {
    const ids = new Set(resultKey ? resultKey.split("|") : []);
    setOverrides((current) => {
      const next: Record<string, OutreachAction> = {};
      let changed = false;
      for (const [id, action] of Object.entries(current)) {
        if (ids.has(id)) next[id] = action;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [resultKey]);

  const selected =
    visible.find((r) => r.company.id === effectiveId) ?? null;
  const suggestedAction =
    selected != null
      ? results.find((r) => r.company.id === selected.company.id)?.action
      : null;

  function selectRow(id: string) {
    setSelectedId(id);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }

  function toggleQueue(action: OutreachAction) {
    setQueue((current) => {
      // Leaving All: jump to that single bucket.
      if (isAllQueue(current)) return [action];

      if (current.includes(action)) {
        const next = current.filter((item) => item !== action);
        // Never allow an empty filter (feels like a broken reload).
        return next.length ? next : current;
      }

      const next = [...current, action];
      // Call + Enrich + Skip === All. Don't enter All by accident -
      // picking the third chip means "show only this".
      if (isAllQueue(next)) return [action];
      return next;
    });
  }

  function showAll() {
    setQueue((current) =>
      isAllQueue(current) ? ["call", "enrich"] : [...QUEUE]
    );
  }

  const showingAll = isAllQueue(queue);
  const totalCount = counts.call + counts.enrich + counts.skip;

  function setAction(id: string, action: OutreachAction) {
    const suggested = results.find((r) => r.company.id === id)?.action;
    setOverrides((current) => {
      if (suggested === action) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: action };
    });
  }

  if (!results.length) {
    return (
      <section className="surface animate-rise px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="display text-[clamp(1.6rem,5vw,1.875rem)] font-bold tracking-tight">
          {loading ? "Scoring…" : "No companies yet"}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-[var(--muted)] sm:text-base">
          {loading
            ? "Ranking each company as Call, Enrich, or Skip."
            : "Import a SaaSquatch CSV, or load the sample list to start reviewing."}
        </p>
      </section>
    );
  }

  return (
    <section className="surface animate-rise overflow-hidden">
      <div className="grid gap-4 border-b border-[var(--line)] px-4 py-4 sm:px-5 sm:py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-6 lg:px-6">
        <div className="min-w-0">
          <h2 className="display text-[clamp(1.75rem,5vw,2.25rem)] font-bold tracking-tight">
            {visible.length} to review
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {totalScored != null ? `${totalScored} scored` : "Scored"}
            {queue.length ? ` · ${cutLabel(queue)}` : ""}
            {loading ? " · updating…" : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={showingAll}
              onClick={showAll}
              className={`h-9 min-w-[4.5rem] flex-1 px-3 text-sm font-bold transition sm:flex-none ${
                showingAll
                  ? "bg-[var(--ink)] text-white"
                  : "bg-transparent text-[var(--muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)]"
              }`}
            >
              All {totalCount}
            </button>
            {QUEUE.map((action) => {
              // When All is on, only All looks selected - action chips stay neutral.
              const on = !showingAll && queue.includes(action);
              const count = counts[action];
              return (
                <button
                  key={action}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleQueue(action)}
                  className={`h-9 min-w-[4.5rem] flex-1 px-3 text-sm font-bold transition sm:flex-none ${
                    on
                      ? ACTION_BG[action]
                      : "bg-transparent text-[var(--muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)]"
                  }`}
                >
                  {ACTION_LABEL[action]} {count}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onExport(visible)}
            disabled={exporting || visible.length === 0}
            className="btn btn-line btn-grow sm:flex-none"
          >
            {exporting ? "Exporting…" : "Export list"}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-[var(--muted)] sm:px-6 sm:py-20 sm:text-base">
          {emptyViewMessage(queue, counts)}
        </div>
      ) : (
        <div className="grid md:grid-cols-[minmax(260px,36%)_minmax(0,1fr)] xl:grid-cols-[minmax(300px,34%)_minmax(0,1fr)]">
          <div className="scroll-quiet max-h-[min(52vh,28rem)] overflow-y-auto overscroll-contain border-b border-[var(--line)] md:max-h-[min(78vh,52rem)] md:border-b-0 md:border-r">
            {visible.map((row, idx) => {
              const active = row.company.id === selectedId;
              const overridden = overrides[row.company.id] != null;
              return (
                <button
                  key={row.company.id}
                  type="button"
                  onClick={() => selectRow(row.company.id)}
                  className={`flex w-full items-start gap-2.5 border-b border-[var(--line)] px-3 py-3.5 text-left transition last:border-b-0 hover:bg-[#fafaf7] sm:gap-3 sm:px-4 sm:py-4 ${
                    active ? "row-active" : "bg-white"
                  }`}
                >
                  <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-[var(--muted)]">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="truncate font-bold">
                        {row.company.name}
                      </div>
                      <span className="display shrink-0 text-sm font-bold tabular-nums sm:text-base">
                        {row.score}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-[var(--muted)] sm:text-sm">
                      {row.company.industry} · {row.company.city},{" "}
                      {row.company.state}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={`font-bold ${ACTION_TONE[row.action]}`}>
                        {ACTION_LABEL[row.action]}
                        {overridden ? " · you" : ""}
                      </span>
                      <span className="text-[var(--muted)]">
                        {formatRevenue(row.company.estimatedRevenueUsd)}
                      </span>
                      {row.whyNow && (
                        <span className="text-[var(--muted)]">Timing signal</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            ref={detailRef}
            className="scroll-quiet scroll-mt-3 bg-white p-4 sm:p-6 md:max-h-[min(78vh,52rem)] md:overflow-y-auto md:overscroll-contain lg:p-7"
          >
            {selected ? (
              <LeadDetail
                key={selected.company.id}
                row={selected}
                suggestedAction={suggestedAction ?? selected.action}
                onSetAction={(action) =>
                  setAction(selected.company.id, action)
                }
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function countFromRows(rows: ScoredCompany[]): ActionCounts {
  const counts: ActionCounts = { call: 0, enrich: 0, skip: 0 };
  for (const row of rows) counts[row.action] += 1;
  return counts;
}

function LeadDetail({
  row,
  suggestedAction,
  onSetAction,
}: {
  row: ScoredCompany;
  suggestedAction: OutreachAction;
  onSetAction: (action: OutreachAction) => void;
}) {
  const { company, breakdown, reasons, outreachOpener, whyNow } = row;
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMail, setAiMail] = useState<{
    subject: string;
    body: string;
    angle: string;
    notice?: string;
    source?: string;
  } | null>(null);
  const [tone, setTone] = useState<"direct" | "professional" | "friendly">(
    "professional"
  );
  const [copied, setCopied] = useState<
    "opener" | "email" | "emailAddr" | "phone" | null
  >(null);

  async function generateAiOutreach(
    nextTone: "direct" | "professional" | "friendly" = tone
  ) {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scored: row, tone: nextTone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI outreach failed");
      setAiMail(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI outreach failed");
    } finally {
      setAiLoading(false);
    }
  }

  function pickTone(next: "direct" | "professional" | "friendly") {
    setTone(next);
    if (aiMail || aiLoading) {
      void generateAiOutreach(next);
    }
  }

  async function copyText(
    text: string,
    which: "opener" | "email" | "emailAddr" | "phone"
  ) {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  const typeLabel =
    company.businessType === "Unknown" ? null : company.businessType;

  return (
    <div className="animate-reveal space-y-5 sm:space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="display break-words text-[clamp(1.5rem,4vw,1.875rem)] font-bold tracking-tight">
            {company.name}
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {company.industry} · {company.city}, {company.state}
            {typeLabel ? ` · ${typeLabel}` : ""}
          </p>
        </div>
        <ScoreBadge score={row.score} grade={row.grade} />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:text-xs">
          Your decision
          {suggestedAction !== row.action
            ? ` · suggested ${ACTION_LABEL[suggestedAction]}`
            : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUEUE.map((action) => {
            const on = row.action === action;
            return (
              <button
                key={action}
                type="button"
                aria-pressed={on}
                onClick={() => onSetAction(action)}
                className={`h-9 min-w-[4.5rem] px-3 text-sm font-bold transition ${
                  on
                    ? ACTION_BG[action]
                    : "bg-transparent text-[var(--muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)]"
                }`}
              >
                {ACTION_LABEL[action]}
              </button>
            );
          })}
        </div>
        <p className={`mt-3 text-sm sm:text-base ${ACTION_TONE[row.action]}`}>
          <span className="font-bold">{ACTION_LABEL[row.action]}. </span>
          <span className="text-[var(--ink)]">{row.actionReason}</span>
        </p>
      </div>

      {whyNow && (
        <p className="border-l-4 border-[var(--yellow)] pl-3 text-sm text-[var(--ink)] sm:text-base">
          <span className="font-bold">Why now. </span>
          {whyNow}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-4 border-y border-[var(--line)] py-4 sm:grid-cols-2 sm:gap-x-8 sm:py-5">
        <Info
          label="Owner"
          value={
            company.ownerName
              ? `${company.ownerName}${company.ownerTitle ? ` · ${company.ownerTitle}` : ""}`
              : "Not enriched"
          }
        />
        <Info
          label="Revenue"
          value={formatRevenue(company.estimatedRevenueUsd)}
        />
        <Info label="Headcount" value={formatEmployees(company.employeeCount)} />
        <Info label="Founded" value={formatFounded(company.yearFounded)} />
        <ContactInfo
          label="Email"
          value={company.email}
          href={company.email ? `mailto:${company.email}` : null}
          copied={copied === "emailAddr"}
          onCopy={() =>
            company.email && void copyText(company.email, "emailAddr")
          }
        />
        <ContactInfo
          label="Phone"
          value={company.phone}
          href={company.phone ? `tel:${company.phone.replace(/[^\d+]/g, "")}` : null}
          copied={copied === "phone"}
          onCopy={() =>
            company.phone && void copyText(company.phone, "phone")
          }
        />
      </dl>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="link break-all"
          >
            {company.website.replace(/^https?:\/\//, "")}
          </a>
        )}
        {company.linkedinUrl && (
          <a
            href={company.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            LinkedIn
          </a>
        )}
      </div>

      {company.description && (
        <p className="text-sm leading-relaxed text-[var(--muted)] sm:text-base">
          {company.description}
        </p>
      )}

      <div>
        <h4 className="display text-base font-bold sm:text-lg">Why it ranked</h4>
        <ul className="mt-3 space-y-2">
          {reasons.slice(0, 6).map((reason) => (
            <li key={reason} className="flex gap-3 text-sm text-[var(--muted)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[var(--yellow)]" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-x-6">
          {(
            [
              ["Industry", breakdown.industryKeyword, WEIGHTS.industryKeyword],
              ["Revenue", breakdown.revenue, WEIGHTS.revenue],
              ["Headcount", breakdown.employees, WEIGHTS.employees],
              ["Geo", breakdown.geo, WEIGHTS.geo],
              ["Data", breakdown.completeness, WEIGHTS.completeness],
              ["Why-now", breakdown.whyNow, WEIGHTS.whyNow],
              ["Tenure", breakdown.established, WEIGHTS.established],
              ["Penalty", -breakdown.penalties, null],
            ] as const
          ).map(([label, value, max]) => (
            <div key={label}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:text-xs">
                {label}
              </div>
              <div className="mt-1 text-sm font-bold tabular-nums sm:text-base">
                {max == null ? value : `${value}/${max}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-5 sm:pt-6">
        <h4 className="display text-base font-bold sm:text-lg">Quick opener</h4>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)] sm:text-base">
          {outreachOpener}
        </p>
        <button
          type="button"
          className="btn btn-quiet mt-3 px-0"
          onClick={() => void copyText(outreachOpener, "opener")}
        >
          {copied === "opener" ? "Copied" : "Copy opener"}
        </button>
      </div>

      <div className="border-t border-[var(--line)] pt-5 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="display text-base font-bold sm:text-lg">Draft email</h4>
          <div className="flex flex-wrap gap-1">
            {(["direct", "professional", "friendly"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pickTone(t)}
                disabled={aiLoading}
                className={`h-8 px-3 text-xs font-bold capitalize transition ${
                  tone === t
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void generateAiOutreach()}
          disabled={aiLoading}
          className="btn btn-solid mt-4 w-full sm:w-auto"
        >
          {aiLoading
            ? "Drafting…"
            : aiMail
              ? "Regenerate email"
              : "Generate email"}
        </button>
        {aiMail && !aiLoading && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Tone changes rewrite this draft automatically.
          </p>
        )}
        {aiError && (
          <p className="mt-3 text-sm text-[var(--danger)]">{aiError}</p>
        )}
        {aiMail && (
          <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-5">
            {aiMail.notice && (
              <p className="border-l-4 border-[var(--yellow)] pl-3 text-sm text-[var(--warn)]">
                {aiMail.notice}
              </p>
            )}
            <p className="text-xs text-[var(--muted)]">{aiMail.angle}</p>
            <p className="font-bold">{aiMail.subject}</p>
            <pre className="whitespace-pre-wrap font-sans text-base leading-7 text-[var(--muted)]">
              {aiMail.body}
            </pre>
            <button
              type="button"
              className="btn btn-quiet px-0"
              onClick={() =>
                void copyText(
                  `Subject: ${aiMail.subject}\n\n${aiMail.body}`,
                  "email"
                )
              }
            >
              {copied === "email" ? "Copied" : "Copy email"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:text-xs">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold sm:text-base">
        {value}
      </dd>
    </div>
  );
}

function ContactInfo({
  label,
  value,
  href,
  copied,
  onCopy,
}: {
  label: string;
  value: string | null;
  href: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:text-xs">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold sm:text-base">
        {value && href ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <a href={href} className="link">
              {value}
            </a>
            <button
              type="button"
              className="text-xs font-bold text-[var(--blue)] hover:underline"
              onClick={onCopy}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </span>
        ) : (
          "-"
        )}
      </dd>
    </div>
  );
}
