import type {
  ActionCounts,
  BusinessType,
  Company,
  OutreachAction,
  ScoreBreakdown,
  ScoredCompany,
  Thesis,
} from "./types";

const WEIGHTS = {
  industryKeyword: 25,
  revenue: 20,
  employees: 10,
  geo: 10,
  completeness: 15,
  whyNow: 12,
  established: 8,
} as const;

const INDUSTRY_NEEDLES: Array<{ labels: string[]; needles: string[] }> = [
  {
    labels: ["hvac", "plumbing", "mechanical"],
    needles: ["hvac", "heating", "cooling", "plumbing", "mechanical", "refrigeration"],
  },
  {
    labels: ["it services", "msp", "it managed"],
    needles: ["msp", "managed service", "it service", "cyber", "helpdesk", "managed detection"],
  },
  {
    labels: ["healthcare", "dental", "medical"],
    needles: ["healthcare", "dental", "medical", "clinic", "pediatric", "rehab", "imaging", "veterinar"],
  },
  {
    labels: ["manufacturing", "industrial"],
    needles: ["manufactur", "fabricat", "machining", "stamping", "die cast", "polymer", "foundry", "job shop"],
  },
  {
    labels: ["facilities services", "facilities"],
    needles: ["facilities", "janitorial", "pest", "grounds", "landscap", "building service"],
  },
  {
    labels: ["logistics", "freight"],
    needles: ["logistics", "freight", "warehouse", "3pl", "trucking"],
  },
  {
    labels: ["professional services", "accounting"],
    needles: ["accounting", "bookkeep", "cpa", "advisory", "professional service"],
  },
  {
    labels: ["software", "saas"],
    needles: ["saas", "software", "mes"],
  },
  {
    labels: ["wholesale", "distribution"],
    needles: ["distribut", "wholesale", "jan-san"],
  },
  {
    labels: ["automotive", "fleet"],
    needles: ["automotive", "auto repair", "fleet"],
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(haystack: string, needles: string[]): string[] {
  const h = normalize(haystack);
  return needles.filter((n) => n.trim() && h.includes(normalize(n)));
}

function companyCorpus(company: Company): string {
  return [
    company.name,
    company.industry,
    company.category,
    company.description,
    company.businessType,
    company.ownerTitle ?? "",
  ].join(" ");
}

function industryCorpus(company: Company): string {
  return [company.name, company.industry, company.category].join(" ");
}

function industryAligned(company: Company, thesisIndustry: string): boolean {
  const corpus = normalize(industryCorpus(company));
  const needle = normalize(thesisIndustry);
  if (!needle) return false;
  if (corpus.includes(needle)) return true;
  const group = INDUSTRY_NEEDLES.find(
    (g) =>
      g.labels.some((l) => needle.includes(l) || l.includes(needle)) ||
      g.needles.some((n) => needle.includes(n))
  );
  if (!group) return false;
  return group.needles.some((n) => corpus.includes(n));
}

function scoreIndustryKeyword(
  company: Company,
  thesis: Thesis
): { points: number; reasons: string[] } {
  const corpus = companyCorpus(company);
  const reasons: string[] = [];

  if (thesis.excludeKeywords.length) {
    const hits = includesAny(corpus, thesis.excludeKeywords);
    if (hits.length) {
      return {
        points: 0,
        reasons: [`Excluded by keyword: ${hits.join(", ")}`],
      };
    }
  }

  let points = 0;
  const max = WEIGHTS.industryKeyword;

  if (thesis.industries.length) {
    const industryHits = thesis.industries.filter((ind) =>
      industryAligned(company, ind)
    );
    if (industryHits.length) {
      points += max * 0.55;
      reasons.push(`Industry fit: ${industryHits.join(", ")}`);
    }
  } else {
    points += max * 0.25;
  }

  if (thesis.mustHaveKeywords.length) {
    const keywordHits = includesAny(corpus, thesis.mustHaveKeywords);
    const ratio = keywordHits.length / thesis.mustHaveKeywords.length;
    points += max * 0.45 * ratio;
    if (keywordHits.length) {
      reasons.push(`Keyword hits: ${keywordHits.join(", ")}`);
    } else {
      reasons.push("No must-have keywords matched");
    }
  } else if (!thesis.industries.length) {
    points += max * 0.2;
    reasons.push("No industry/keyword ICP set - neutral score");
  } else {
    points += max * 0.2;
  }

  return { points: Math.min(points, max), reasons };
}

function scoreBand(
  value: number | null,
  min: number | null,
  maxVal: number | null,
  maxPoints: number,
  label: string,
  format: (n: number) => string
): { points: number; reasons: string[]; farOutside: boolean } {
  if (min == null && maxVal == null) {
    return {
      points: maxPoints * 0.5,
      reasons: [`No ${label} band set - neutral score`],
      farOutside: false,
    };
  }
  if (value == null) {
    return {
      points: maxPoints * 0.2,
      reasons: [`${label} unknown - limited size confidence`],
      farOutside: false,
    };
  }

  const lo = min ?? 0;
  const hi = maxVal ?? Number.POSITIVE_INFINITY;

  if (value >= lo && value <= hi) {
    const mid = maxVal != null ? (lo + maxVal) / 2 : Math.max(lo * 1.5, lo + 1);
    const distance = Math.abs(value - mid) / Math.max(mid, 1);
    const closeness = Math.max(0, 1 - distance);
    return {
      points: maxPoints * (0.7 + 0.3 * closeness),
      reasons: [`${label} ${format(value)} is inside ICP band`],
      farOutside: false,
    };
  }

  if (min != null && value < min) {
    const ratio = value / min;
    if (ratio >= 0.7) {
      return {
        points: maxPoints * 0.35 * ratio,
        reasons: [`${label} ${format(value)} slightly below minimum ${format(min)}`],
        farOutside: false,
      };
    }
  }
  if (maxVal != null && value > maxVal) {
    const ratio = maxVal / value;
    if (ratio >= 0.7) {
      return {
        points: maxPoints * 0.35 * ratio,
        reasons: [`${label} ${format(value)} slightly above maximum ${format(maxVal)}`],
        farOutside: false,
      };
    }
  }

  return {
    points: 0,
    reasons: [`${label} ${format(value)} outside ICP band`],
    farOutside: true,
  };
}

function scoreGeo(
  company: Company,
  thesis: Thesis
): { points: number; reasons: string[] } {
  const max = WEIGHTS.geo;
  if (!thesis.states.length) {
    return {
      points: max * 0.5,
      reasons: ["No geo filter set - neutral score"],
    };
  }

  const match = thesis.states.some(
    (s) => normalize(s) === normalize(company.state)
  );
  if (match) {
    return {
      points: max,
      reasons: [`Located in target state: ${company.state}`],
    };
  }
  return {
    points: 0,
    reasons: [`Outside target geos (${company.city}, ${company.state})`],
  };
}

function scoreCompleteness(company: Company): {
  points: number;
  reasons: string[];
  penalties: number;
} {
  const max = WEIGHTS.completeness;
  const checks = [
    { ok: Boolean(company.website), label: "website" },
    { ok: Boolean(company.phone || company.email), label: "contact path" },
    { ok: Boolean(company.ownerName), label: "decision-maker" },
    { ok: company.estimatedRevenueUsd != null, label: "revenue estimate" },
    { ok: company.employeeCount != null, label: "headcount" },
    { ok: Boolean(company.linkedinUrl), label: "LinkedIn" },
    { ok: company.yearFounded != null, label: "year founded" },
  ];
  const hits = checks.filter((c) => c.ok);
  const points = (hits.length / checks.length) * max;
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const reasons = [
    `Data completeness ${hits.length}/${checks.length}${
      missing.length ? ` (missing: ${missing.join(", ")})` : ""
    }`,
  ];

  let penalties = 0;
  if (!company.website) penalties += 4;
  if (!company.phone && !company.email) penalties += 4;
  if (!company.ownerName) penalties += 2;

  return { points, reasons, penalties };
}

function scoreWhyNow(company: Company): {
  points: number;
  reasons: string[];
  whyNow: string | null;
} {
  const max = WEIGHTS.whyNow;
  if (company.triggerType === "none" || !company.triggerSummary) {
    return {
      points: max * 0.15,
      reasons: ["No recent trigger signal"],
      whyNow: null,
    };
  }

  const boost: Record<string, number> = {
    funding: 1,
    leadership_change: 0.95,
    hiring_surge: 0.8,
    news: 0.75,
    none: 0.15,
  };
  const points = max * (boost[company.triggerType] ?? 0.5);
  return {
    points,
    reasons: [`Why-now: ${company.triggerSummary}`],
    whyNow: company.triggerSummary,
  };
}

function scoreEstablished(company: Company, now = 2026): {
  points: number;
  reasons: string[];
} {
  const max = WEIGHTS.established;
  const year = company.yearFounded;
  if (year == null) {
    return {
      points: max * 0.4,
      reasons: ["Year founded unknown"],
    };
  }
  const age = Math.max(0, now - year);
  if (age >= 15) {
    return {
      points: max,
      reasons: [`Founded ${year} (${age} yr) - established operator`],
    };
  }
  if (age >= 8) {
    return {
      points: max * 0.75,
      reasons: [`Founded ${year} (${age} yr)`],
    };
  }
  if (age >= 4) {
    return {
      points: max * 0.45,
      reasons: [`Founded ${year} (${age} yr) - still maturing`],
    };
  }
  return {
    points: max * 0.2,
    reasons: [`Founded ${year} (${age} yr) - young for this ICP`],
  };
}

function gradeFromScore(score: number): ScoredCompany["grade"] {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  return "D";
}

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function buildOutreachOpener(company: Company, reasons: string[]): string {
  const contact = company.ownerName?.split(" ")[0] ?? "there";
  const trigger = company.triggerSummary
    ? ` Also: ${company.triggerSummary.replace(/\.$/, "")}.`
    : "";
  const industryFit = reasons.find((r) => r.startsWith("Industry fit:"));
  const fitHint = industryFit
    ? industryFit.replace(/^Industry fit:\s*/i, "")
    : company.industry;

  return `Hi ${contact} - ${company.name} looks like a strong fit (${fitHint} in ${company.city}).${trigger} Open to a short conversation this week?`;
}

function businessTypeAllowed(
  company: Company,
  thesis: Thesis
): { ok: boolean; reason?: string } {
  if (!thesis.businessTypes.length) return { ok: true };
  if (company.businessType === "Unknown") return { ok: true };
  if (company.businessType === "Both") return { ok: true };
  if (thesis.businessTypes.includes(company.businessType)) return { ok: true };
  if (
    thesis.businessTypes.includes("Both" as BusinessType) ||
    thesis.businessTypes.includes("Unknown")
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Business type ${company.businessType} not in ICP`,
  };
}

function recommendAction(
  score: number,
  company: Company,
  gates: {
    hardExclude: boolean;
    industryMiss: boolean;
    revenueFar: boolean;
    geoMiss: boolean;
  }
): { action: OutreachAction; actionReason: string } {
  if (gates.hardExclude) {
    return {
      action: "skip",
      actionReason: "Excluded by keyword - don't spend an enrichment credit.",
    };
  }
  if (gates.industryMiss) {
    return {
      action: "skip",
      actionReason: "Industry is outside the ICP - don't enrich.",
    };
  }
  if (gates.revenueFar) {
    return {
      action: "skip",
      actionReason: "Revenue is far outside the ICP band - don't enrich.",
    };
  }
  if (gates.geoMiss) {
    return {
      action: "skip",
      actionReason: "Outside the target states - don't enrich.",
    };
  }
  if (score < 45) {
    return {
      action: "skip",
      actionReason:
        "Below the ICP bar - don't spend an enrichment credit or a call slot.",
    };
  }
  const hasContact = Boolean(company.email || company.phone);
  const hasOwner = Boolean(company.ownerName);
  if (!hasContact) {
    return {
      action: "enrich",
      actionReason:
        "Fits the ICP but has no email/phone. Enrich before outreach so the credit is spent on a real fit.",
    };
  }
  if (!hasOwner) {
    return {
      action: "enrich",
      actionReason:
        "Has a contact path but no decision-maker. Enrich the owner/title before calling.",
    };
  }
  return {
    action: "call",
    actionReason: "ICP fit with a decision-maker and a contact path - ready to outreach.",
  };
}

export function scoreCompany(company: Company, thesis: Thesis): ScoredCompany {
  const typeGate = businessTypeAllowed(company, thesis);
  const industry = scoreIndustryKeyword(company, thesis);
  const revenue = scoreBand(
    company.estimatedRevenueUsd,
    thesis.revenueMin,
    thesis.revenueMax,
    WEIGHTS.revenue,
    "Revenue",
    (n) => `$${formatMoney(n)}`
  );
  const employees = scoreBand(
    company.employeeCount,
    thesis.employeeMin,
    thesis.employeeMax,
    WEIGHTS.employees,
    "Headcount",
    (n) => `${n}`
  );
  const geo = scoreGeo(company, thesis);
  const completeness = scoreCompleteness(company);
  const whyNow = scoreWhyNow(company);
  const established = scoreEstablished(company);

  const hardExclude =
    industry.points === 0 &&
    industry.reasons.some((r) => r.startsWith("Excluded"));

  let raw =
    industry.points +
    revenue.points +
    employees.points +
    geo.points +
    completeness.points +
    whyNow.points +
    established.points -
    completeness.penalties;

  if (!typeGate.ok) raw = Math.min(raw, 35);
  if (hardExclude) raw = Math.min(raw, 15);
  const industryMiss =
    thesis.industries.length > 0 &&
    !industry.reasons.some((r) => r.startsWith("Industry fit"));
  const geoMiss = thesis.states.length > 0 && geo.points === 0;
  const revenueFar = revenue.farOutside;
  // Failed gates stay under the call bar so completeness and why-now
  // cannot outrank an account that actually fits.
  if (industryMiss || revenueFar) raw = Math.min(raw, 40);
  if (geoMiss) raw = Math.min(raw, 42);

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const { action, actionReason } = recommendAction(score, company, {
    hardExclude,
    industryMiss,
    revenueFar,
    geoMiss,
  });

  const breakdown: ScoreBreakdown = {
    industryKeyword: round1(industry.points),
    revenue: round1(revenue.points),
    employees: round1(employees.points),
    geo: round1(geo.points),
    completeness: round1(completeness.points),
    whyNow: round1(whyNow.points),
    established: round1(established.points),
    penalties: completeness.penalties,
  };

  const reasons = [
    ...industry.reasons,
    ...revenue.reasons,
    ...employees.reasons,
    ...geo.reasons,
    ...completeness.reasons,
    ...whyNow.reasons,
    ...established.reasons,
  ];
  if (typeGate.reason) reasons.unshift(typeGate.reason);

  return {
    company,
    score,
    grade: gradeFromScore(score),
    breakdown,
    reasons,
    outreachOpener: buildOutreachOpener(company, reasons),
    whyNow: whyNow.whyNow,
    action,
    actionReason,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function rankCompanies(
  companies: Company[],
  thesis: Thesis
): ScoredCompany[] {
  const scored = companies.map((c) => scoreCompany(c, thesis));
  scored.sort(
    (a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name)
  );
  return scored;
}

export function takeShortlist(
  scored: ScoredCompany[],
  topN: number,
  actions?: OutreachAction[]
): ScoredCompany[] {
  const queue =
    actions && actions.length
      ? scored.filter((row) => actions.includes(row.action))
      : scored;
  return queue.slice(0, Math.max(1, topN || 25));
}

export function countActions(scored: ScoredCompany[]): ActionCounts {
  const counts: ActionCounts = { call: 0, enrich: 0, skip: 0 };
  for (const row of scored) counts[row.action] += 1;
  return counts;
}

export function sanitizeThesis(input: Partial<Thesis> | undefined): Thesis {
  const base = { ...DEFAULT_THESIS, ...(input ?? {}) };
  const numOrNull = (v: unknown) =>
    v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
  return {
    industries: Array.isArray(base.industries) ? base.industries.filter(Boolean) : [],
    states: Array.isArray(base.states) ? base.states.filter(Boolean) : [],
    revenueMin: numOrNull(base.revenueMin),
    revenueMax: numOrNull(base.revenueMax),
    employeeMin: numOrNull(base.employeeMin),
    employeeMax: numOrNull(base.employeeMax),
    businessTypes: Array.isArray(base.businessTypes) ? base.businessTypes : [],
    mustHaveKeywords: Array.isArray(base.mustHaveKeywords)
      ? base.mustHaveKeywords.filter(Boolean)
      : [],
    excludeKeywords: Array.isArray(base.excludeKeywords)
      ? base.excludeKeywords.filter(Boolean)
      : [],
    topN: Math.min(50, Math.max(1, Number(base.topN) || 15)),
  };
}

export const DEFAULT_QUEUE: OutreachAction[] = ["call", "enrich"];

export const DEFAULT_THESIS: Thesis = {
  industries: ["HVAC", "IT Services", "Healthcare", "Manufacturing"],
  states: ["CA", "TX", "FL", "IL", "NY"],
  revenueMin: 1_000_000,
  revenueMax: 20_000_000,
  employeeMin: 10,
  employeeMax: 120,
  businessTypes: ["B2B"],
  mustHaveKeywords: ["recurring"],
  excludeKeywords: ["crypto", "cannabis", "staffing"],
  topN: 15,
};

export { WEIGHTS, formatMoney };
