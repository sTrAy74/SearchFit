import { REGION_MAP, STATE_MAP } from "./geo";
import { DEFAULT_THESIS } from "./scoring";
import type { BusinessType, Thesis } from "./types";

const INDUSTRY_ALIASES: Array<{ match: RegExp; label: string }> = [
  { match: /\bhvac\b|\bheating\b|\bcooling\b|\bplumbing\b/i, label: "HVAC" },
  {
    match: /\bmsp\b|\bmanaged service|\bit service|\bcyber/i,
    label: "IT Services",
  },
  {
    match: /\bhealthcare\b|\bdental\b|\bmedical\b|\bclinic\b|\bveterinar/i,
    label: "Healthcare",
  },
  {
    match: /\bmanufactur|\bindustrial\b|\bfabricat/i,
    label: "Manufacturing",
  },
  {
    match: /\blandscap|\bfacilities\b|\bpest\b|\bwaste\b/i,
    label: "Facilities Services",
  },
  { match: /\blogistics\b|\bfreight\b|\bwarehouse\b/i, label: "Logistics" },
  {
    match: /\baccounting\b|\bbookkeep|\bprofessional service/i,
    label: "Professional Services",
  },
  { match: /\bsaas\b|\bsoftware\b/i, label: "Software" },
  { match: /\bdistribut|\bwholesale\b/i, label: "Wholesale" },
  { match: /\bauto repair|\bautomotive\b|\bfleet\b/i, label: "Automotive" },
];

function parseMoneyToken(token: string): number | null {
  const cleaned = token.trim().toUpperCase().replace(/[$,]/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(K|M|B)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (Number.isNaN(n)) return null;
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") return Math.round(n * 1_000);
  if (suffix === "M") return Math.round(n * 1_000_000);
  if (suffix === "B") return Math.round(n * 1_000_000_000);
  if (n > 0 && n < 1000) return Math.round(n * 1_000_000);
  return Math.round(n);
}

function scaleMoney(amount: number, suffix: string): number {
  const unit = suffix.toUpperCase();
  if (unit === "K") return Math.round(amount * 1_000);
  if (unit === "M") return Math.round(amount * 1_000_000);
  if (unit === "B") return Math.round(amount * 1_000_000_000);
  if (amount > 0 && amount < 1000) return Math.round(amount * 1_000_000);
  return Math.round(amount);
}

function extractRevenue(prompt: string): {
  revenueMin: number | null;
  revenueMax: number | null;
} {
  // "$2–12M", "$2M-$12M", and "$2M to $12M". A suffix on either side applies to both.
  const shorthand = prompt.match(
    /\$\s*(\d+(?:\.\d+)?)\s*([kmb])?\s*(?:-|–|-|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*([kmb])?/i
  );
  if (shorthand) {
    const leftSuffix = (shorthand[2] || "").toUpperCase();
    const rightSuffix = (shorthand[4] || "").toUpperCase();
    const shared = rightSuffix || leftSuffix;
    const a = scaleMoney(Number(shorthand[1]), leftSuffix || shared);
    const b = scaleMoney(Number(shorthand[3]), rightSuffix || shared);
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      return { revenueMin: Math.min(a, b), revenueMax: Math.max(a, b) };
    }
  }

  const between = prompt.match(
    /(?:between|from)\s*\$?\s*([\d.,]+\s*[kmb]?)\s*(?:-|–|to|and)\s*\$?\s*([\d.,]+\s*[kmb]?)/i
  );
  if (between) {
    const a = parseMoneyToken(between[1]);
    const b = parseMoneyToken(between[2]);
    if (a != null && b != null) {
      return { revenueMin: Math.min(a, b), revenueMax: Math.max(a, b) };
    }
  }

  const under = prompt.match(
    /(?:under|below|less than|<\s*)\$?\s*([\d.,]+\s*[kmb]?)/i
  );
  if (under) {
    return { revenueMin: 1_000_000, revenueMax: parseMoneyToken(under[1]) };
  }

  const over = prompt.match(
    /(?:over|above|greater than|>\s*|at least)\s*\$?\s*([\d.,]+\s*[kmb]?)/i
  );
  if (over) {
    return { revenueMin: parseMoneyToken(over[1]), revenueMax: 50_000_000 };
  }

  return {
    revenueMin: DEFAULT_THESIS.revenueMin,
    revenueMax: DEFAULT_THESIS.revenueMax,
  };
}

function extractEmployees(prompt: string): {
  employeeMin: number | null;
  employeeMax: number | null;
} {
  const between = prompt.match(
    /(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:employees|headcount|people|staff)/i
  );
  if (between) {
    return {
      employeeMin: Number(between[1]),
      employeeMax: Number(between[2]),
    };
  }
  const under = prompt.match(
    /(?:under|below|less than|<\s*)(\d+)\s*(?:employees|headcount|people|staff)/i
  );
  if (under) {
    return { employeeMin: 5, employeeMax: Number(under[1]) };
  }
  return {
    employeeMin: DEFAULT_THESIS.employeeMin,
    employeeMax: DEFAULT_THESIS.employeeMax,
  };
}

function extractStates(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const found = new Set<string>();

  for (const [region, states] of Object.entries(REGION_MAP)) {
    if (lower.includes(region)) states.forEach((s) => found.add(s));
  }

  for (const [name, code] of Object.entries(STATE_MAP)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(prompt)) found.add(code);
  }

  const codeMatches = prompt.toUpperCase().match(/\b[A-Z]{2}\b/g) ?? [];
  const valid = new Set(Object.values(STATE_MAP));
  for (const code of codeMatches) {
    if (valid.has(code)) found.add(code);
  }

  return found.size ? Array.from(found) : [...DEFAULT_THESIS.states];
}

function extractIndustries(prompt: string): string[] {
  const hits = INDUSTRY_ALIASES.filter((a) => a.match.test(prompt)).map(
    (a) => a.label
  );
  return hits.length ? hits : [...DEFAULT_THESIS.industries];
}

function extractBusinessTypes(prompt: string): BusinessType[] {
  const hasB2B = /\bb2b\b/i.test(prompt);
  const hasB2C = /\bb2c\b/i.test(prompt);
  if (hasB2B && hasB2C) return ["Both"];
  if (hasB2B) return ["B2B"];
  if (hasB2C) return ["B2C"];
  return ["B2B"];
}

function extractKeywords(prompt: string, kind: "must" | "exclude"): string[] {
  if (kind === "exclude") {
    const out: string[] = [];
    // Only add excludes the prompt actually asks for - client merges with current.
    if (
      (/crypto|bitcoin|web3/i.test(prompt) &&
        /exclude|avoid|no\b/i.test(prompt)) ||
      /no crypto|avoid crypto|exclude crypto/i.test(prompt)
    ) {
      out.push("crypto");
    }
    if (
      (/cannabis|marijuana|weed/i.test(prompt) &&
        /exclude|avoid|no\b/i.test(prompt)) ||
      /no cannabis|avoid cannabis|exclude cannabis/i.test(prompt)
    ) {
      out.push("cannabis");
    }
    if (
      /staffing/i.test(prompt) &&
      /exclude|avoid|no\b/i.test(prompt)
    ) {
      out.push("staffing");
    }
    return out;
  }

  const must: string[] = [];
  if (/recurring|subscription|contract/i.test(prompt)) must.push("recurring");
  if (/\bservice/.test(prompt.toLowerCase())) must.push("service");
  if (/owner[- ]operat/i.test(prompt)) must.push("owner");
  return must.length ? must : [...DEFAULT_THESIS.mustHaveKeywords];
}

/** Offline / degraded ICP parse when Gemini is unavailable. */
export function parseThesisLocally(prompt: string): {
  thesis: Thesis;
  summary: string;
} {
  const revenue = extractRevenue(prompt);
  const employees = extractEmployees(prompt);
  const thesis: Thesis = {
    industries: extractIndustries(prompt),
    states: extractStates(prompt),
    revenueMin: revenue.revenueMin,
    revenueMax: revenue.revenueMax,
    employeeMin: employees.employeeMin,
    employeeMax: employees.employeeMax,
    businessTypes: extractBusinessTypes(prompt),
    mustHaveKeywords: extractKeywords(prompt, "must"),
    excludeKeywords: extractKeywords(prompt, "exclude"),
    topN: 15,
  };

  const summary = `Local parse: ${thesis.industries.join(", ")} in ${thesis.states.join(
    "/"
  )}, targeting roughly $${Math.round((thesis.revenueMin ?? 0) / 1e6)}–$${Math.round(
    (thesis.revenueMax ?? 0) / 1e6
  )}M and ${thesis.employeeMin ?? "?"}–${thesis.employeeMax ?? "?"} employees.`;

  return { thesis, summary };
}
