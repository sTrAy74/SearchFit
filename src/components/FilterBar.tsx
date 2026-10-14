"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { formatRevenue } from "@/lib/format";
import type { BusinessType, Thesis } from "@/lib/types";

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

function useMenuPosition(open: boolean, anchorRef: RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<MenuPos | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
      const spaceAbove = rect.top - gap - 12;
      const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.min(256, Math.max(120, preferBelow ? spaceBelow : spaceAbove));
      const top = preferBelow
        ? rect.bottom + gap
        : Math.max(12, rect.top - gap - maxHeight);
      setPos({
        top,
        left: rect.left,
        width: Math.max(rect.width, 180),
        maxHeight,
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  return pos;
}

const INDUSTRY_OPTIONS = [
  "HVAC",
  "IT Services",
  "Healthcare",
  "Manufacturing",
  "Facilities Services",
  "Logistics",
  "Professional Services",
  "Software",
  "Wholesale",
  "Automotive",
];

const STATE_OPTIONS = [
  "AZ",
  "CA",
  "CO",
  "FL",
  "GA",
  "IL",
  "NY",
  "OH",
  "SC",
  "TX",
  "WA",
];

const BUSINESS_OPTIONS: BusinessType[] = ["B2B", "B2C", "Both"];

const EXCLUDE_OPTIONS = ["crypto", "cannabis", "staffing", "fintech"];

const MUST_OPTIONS = ["recurring", "service", "owner-operated", "B2B"];

const REVENUE_PRESETS: Array<{
  id: string;
  label: string;
  min: number | null;
  max: number | null;
}> = [
  { id: "any", label: "Any revenue", min: null, max: null },
  { id: "1-5", label: "$1–5M", min: 1_000_000, max: 5_000_000 },
  { id: "2-12", label: "$2–12M", min: 2_000_000, max: 12_000_000 },
  { id: "1-20", label: "$1–20M", min: 1_000_000, max: 20_000_000 },
  { id: "5-25", label: "$5–25M", min: 5_000_000, max: 25_000_000 },
  { id: "u15", label: "Under $15M", min: null, max: 15_000_000 },
];

const HEADCOUNT_PRESETS: Array<{
  id: string;
  label: string;
  min: number | null;
  max: number | null;
}> = [
  { id: "any", label: "Any size", min: null, max: null },
  { id: "10-50", label: "10–50", min: 10, max: 50 },
  { id: "10-80", label: "10–80", min: 10, max: 80 },
  { id: "10-120", label: "10–120", min: 10, max: 120 },
  { id: "20-200", label: "20–200", min: 20, max: 200 },
];

const EXAMPLES = [
  "B2B HVAC and MSP in Texas, $2–12M revenue, 10–80 employees, recurring service",
  "Healthcare services in FL/CA under $15M, exclude staffing agencies",
  "Niche manufacturing in CA/TX/IL, $3–10M, owner-operated, no crypto",
];

type Props = {
  thesis: Thesis;
  onChange: (thesis: Thesis) => void;
  onScore: () => void;
  onAiThesis: (prompt: string) => Promise<void>;
  loading: boolean;
  aiLoading: boolean;
  aiSummary: string | null;
  onDismissSummary?: () => void;
};

export function FilterBar({
  thesis,
  onChange,
  onScore,
  onAiThesis,
  loading,
  aiLoading,
  aiSummary,
  onDismissSummary,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [showWords, setShowWords] = useState(false);
  const busy = loading || aiLoading;
  const hasPrompt = prompt.trim().length > 0;

  function patch(partial: Partial<Thesis>) {
    onChange({ ...thesis, ...partial });
  }

  function toggleList(key: "industries" | "states" | "excludeKeywords" | "mustHaveKeywords", value: string) {
    const current = thesis[key];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    patch({ [key]: next });
  }

  function toggleBusiness(type: BusinessType) {
    const set = new Set(thesis.businessTypes);
    if (set.has(type)) set.delete(type);
    else set.add(type);
    patch({ businessTypes: Array.from(set) });
  }

  const revenueId =
    REVENUE_PRESETS.find(
      (p) => p.min === thesis.revenueMin && p.max === thesis.revenueMax
    )?.id ?? "custom";

  const headcountId =
    HEADCOUNT_PRESETS.find(
      (p) => p.min === thesis.employeeMin && p.max === thesis.employeeMax
    )?.id ?? "custom";

  return (
    <section className="surface animate-rise relative z-20 overflow-visible">
      <div className="overflow-visible border-b border-[var(--line)] px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="display text-[clamp(1.5rem,4vw,1.875rem)] font-bold tracking-tight">
              Who are you looking for?
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Filters update the list as you go. Or describe the profile in
              words.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => setShowWords((v) => !v)}
              className="btn btn-solid btn-grow sm:flex-none"
            >
              {showWords ? "Hide words" : "Describe in words"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onScore}
              className="btn btn-quiet btn-grow sm:flex-none"
              title="Usually not needed - filters already rescore live"
            >
              {loading && !aiLoading ? "Scoring…" : "Rescore"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MultiDropdown
            label="Industry"
            summary={summaryList(thesis.industries, "Any industry")}
            options={INDUSTRY_OPTIONS}
            selected={thesis.industries}
            onToggle={(value) => toggleList("industries", value)}
            onClear={() => patch({ industries: [] })}
          />
          <MultiDropdown
            label="States"
            summary={summaryList(thesis.states, "Any state")}
            options={STATE_OPTIONS}
            selected={thesis.states}
            onToggle={(value) => toggleList("states", value)}
            onClear={() => patch({ states: [] })}
          />
          <SingleDropdown
            label="Revenue"
            summary={
              revenueId === "custom"
                ? `${formatRevenue(thesis.revenueMin)} – ${formatRevenue(thesis.revenueMax)}`
                : (REVENUE_PRESETS.find((p) => p.id === revenueId)?.label ??
                  "Revenue")
            }
            options={REVENUE_PRESETS.map((p) => ({
              id: p.id,
              label: p.label,
            }))}
            value={revenueId === "custom" ? "" : revenueId}
            onPick={(id) => {
              const preset = REVENUE_PRESETS.find((p) => p.id === id);
              if (!preset) return;
              patch({ revenueMin: preset.min, revenueMax: preset.max });
            }}
          />
          <SingleDropdown
            label="Headcount"
            summary={
              headcountId === "custom"
                ? `${thesis.employeeMin ?? "?"}–${thesis.employeeMax ?? "?"}`
                : (HEADCOUNT_PRESETS.find((p) => p.id === headcountId)?.label ??
                  "Headcount")
            }
            options={HEADCOUNT_PRESETS.map((p) => ({
              id: p.id,
              label: p.label,
            }))}
            value={headcountId === "custom" ? "" : headcountId}
            onPick={(id) => {
              const preset = HEADCOUNT_PRESETS.find((p) => p.id === id);
              if (!preset) return;
              patch({ employeeMin: preset.min, employeeMax: preset.max });
            }}
          />
          <MultiDropdown
            label="Type"
            summary={summaryList(thesis.businessTypes, "Any type")}
            options={BUSINESS_OPTIONS}
            selected={thesis.businessTypes}
            onToggle={(value) => toggleBusiness(value as BusinessType)}
            onClear={() => patch({ businessTypes: [] })}
          />
          <MultiDropdown
            label="Exclude"
            summary={
              thesis.excludeKeywords.length
                ? `No ${thesis.excludeKeywords.slice(0, 2).join(", ")}${thesis.excludeKeywords.length > 2 ? "…" : ""}`
                : "Nothing excluded"
            }
            options={EXCLUDE_OPTIONS}
            selected={thesis.excludeKeywords}
            onToggle={(value) => toggleList("excludeKeywords", value)}
            onClear={() => patch({ excludeKeywords: [] })}
            danger
          />
          <MultiDropdown
            label="Must have"
            summary={summaryList(thesis.mustHaveKeywords, "No must-haves")}
            options={MUST_OPTIONS}
            selected={thesis.mustHaveKeywords}
            onToggle={(value) => toggleList("mustHaveKeywords", value)}
            onClear={() => patch({ mustHaveKeywords: [] })}
          />
        </div>

        {aiSummary && (
          <div className="mt-4 flex items-start justify-between gap-3 border-l-4 border-[var(--blue)] bg-[var(--blue-soft)] px-4 py-3 text-sm text-[var(--ink)]">
            <p>
              <span className="font-bold">Understood. </span>
              {aiSummary}
            </p>
            {onDismissSummary && (
              <button
                type="button"
                className="shrink-0 text-xs font-bold text-[var(--blue)] hover:underline"
                onClick={onDismissSummary}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>

      {showWords && (
        <div className="border-b border-[var(--line)] bg-[#fafaf7] px-4 py-4 sm:px-5 lg:px-6">
          <p className="text-sm text-[var(--muted)]">
            Prefer typing? Paste the profile you searched - we fill the dropdowns.
          </p>
          <textarea
            rows={3}
            className="field mt-3 resize-y leading-relaxed placeholder:text-[var(--muted)]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Industry, states, revenue, who to exclude…"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                title={example}
                onClick={() => setPrompt(example)}
                className="w-full border border-[var(--line)] bg-white px-3 py-2 text-left text-xs text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)] sm:w-auto sm:max-w-md"
              >
                <span className="line-clamp-2 sm:line-clamp-1">{example}</span>
              </button>
            ))}
          </div>
          {hasPrompt && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAiThesis(prompt)}
              className="btn btn-solid mt-4"
            >
              {aiLoading ? "Reading…" : "Apply to filters"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function summaryList(values: string[], empty: string): string {
  if (!values.length) return empty;
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

function MultiDropdown({
  label,
  summary,
  options,
  selected,
  onToggle,
  onClear,
  danger,
  compact,
}: {
  label: string;
  summary: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  danger?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const pos = useMenuPosition(open, rootRef);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = selected.length > 0;

  return (
    <div ref={rootRef} className={`relative ${compact ? "min-w-[10rem]" : ""}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-[42px] w-full items-center justify-between gap-2 border px-3 text-left transition ${
          open
            ? "border-[var(--ink)] bg-white shadow-[0_0_0_3px_rgba(255,219,0,0.55)]"
            : active
              ? danger
                ? "border-[var(--danger)] bg-[var(--danger-soft)]"
                : "border-[var(--ink)] bg-white"
              : "border-[var(--line)] bg-white hover:border-[var(--ink)]"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {label}
          </span>
          <span
            className={`block truncate text-sm font-bold ${
              danger && active ? "text-[var(--danger)]" : "text-[var(--ink)]"
            }`}
          >
            {summary}
          </span>
        </span>
        <span className="shrink-0 text-[var(--muted)]" aria-hidden>
          ▾
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
            className="z-[80] overflow-y-auto border border-[var(--ink)] bg-white shadow-[0_12px_28px_rgba(17,17,17,0.12)]"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-[var(--line)] bg-white px-3 py-2">
              <span className="text-xs font-semibold text-[var(--muted)]">
                {selected.length} selected
              </span>
              <button
                type="button"
                className="text-xs font-bold text-[var(--blue)] hover:underline"
                onClick={onClear}
              >
                Clear
              </button>
            </div>
            <ul className="py-1">
              {options.map((option) => {
                const on = selected.includes(option);
                return (
                  <li key={option}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => onToggle(option)}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[#fafaf7] ${
                        on ? "font-bold" : "font-medium text-[var(--muted)]"
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 place-items-center border text-[10px] ${
                          on
                            ? "border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)]"
                            : "border-[var(--line)] bg-white"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : ""}
                      </span>
                      {option}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}

function SingleDropdown({
  label,
  summary,
  options,
  value,
  onPick,
}: {
  label: string;
  summary: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const pos = useMenuPosition(open, rootRef);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-[42px] w-full items-center justify-between gap-2 border px-3 text-left transition ${
          open
            ? "border-[var(--ink)] bg-white shadow-[0_0_0_3px_rgba(255,219,0,0.55)]"
            : "border-[var(--ink)] bg-white hover:border-[var(--ink)]"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {label}
          </span>
          <span className="block truncate text-sm font-bold">{summary}</span>
        </span>
        <span className="shrink-0 text-[var(--muted)]" aria-hidden>
          ▾
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
            className="z-[80] overflow-y-auto border border-[var(--ink)] bg-white shadow-[0_12px_28px_rgba(17,17,17,0.12)]"
          >
            <ul className="py-1">
              {options.map((option) => {
                const on = option.id === value;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => {
                        onPick(option.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-2.5 text-left text-sm hover:bg-[#fafaf7] ${
                        on
                          ? "bg-[#fffef6] font-bold"
                          : "font-medium text-[var(--muted)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
