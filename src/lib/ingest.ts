import { normalizeStateToken, parseLocation } from "./geo";
import type { BusinessType, Company, IngestStats, TriggerType } from "./types";

const MAX_ROWS = 2500;

const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    "company",
    "company name",
    "company_name",
    "organization",
    "organization name",
    "account",
    "account name",
    "business name",
    "name",
  ],
  industry: ["industry", "sector", "category", "company industry"],
  category: ["category", "subindustry", "sub industry", "naics description"],
  description: ["description", "about", "snippet", "company description", "notes"],
  website: ["website", "domain", "url", "company website", "company domain", "web"],
  city: ["city", "locality"],
  state: ["state", "region", "province"],
  location: ["location", "hq", "headquarters", "address", "company location"],
  country: ["country"],
  revenue: [
    "revenue",
    "estimated revenue",
    "annual revenue",
    "estimatedrevenue",
    "estimated revenue usd",
    "company revenue",
  ],
  employees: [
    "employees",
    "employee count",
    "employee_count",
    "headcount",
    "company size",
    "employees count",
    "number of employees",
  ],
  yearFounded: ["year founded", "founded", "founded year", "founded_year", "yearfounded"],
  email: ["email", "work email", "email address", "company email", "contact email"],
  phone: ["phone", "phone number", "mobile", "direct phone", "company phone", "telephone"],
  linkedin: [
    "linkedin",
    "linkedin url",
    "company linkedin",
    "linkedin url company",
    "linkedin_url",
  ],
  owner: [
    "owner",
    "contact name",
    "full name",
    "decision maker",
    "contact",
    "person name",
  ],
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last"],
  title: ["title", "job title", "owner title", "contact title", "position"],
  businessType: ["business type", "b2b/b2c", "business_type", "customer type"],
};

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[_/|]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function pick(
  record: Record<string, string>,
  field: keyof typeof FIELD_ALIASES
): string {
  for (const alias of FIELD_ALIASES[field]) {
    const v = record[alias];
    if (v != null && v.trim()) return v.trim();
  }
  return "";
}

export function parseMoneyCell(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/usd/gi, "").replace(/[,$\s]/g, "").trim();
  if (!cleaned) return null;
  const million = raw.match(/([\d.]+)\s*(million|mm)\b/i);
  if (million) return Math.round(Number(million[1]) * 1_000_000);
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)(K|M|B)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return null;
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "K") return Math.round(n * 1_000);
  if (suffix === "M") return Math.round(n * 1_000_000);
  if (suffix === "B") return Math.round(n * 1_000_000_000);
  if (n > 0 && n < 1000 && /[mb]/i.test(raw)) return Math.round(n * 1_000_000);
  return Math.round(n);
}

export function parseEmployeeCell(raw: string): number | null {
  if (!raw) return null;
  const range = raw.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (range) {
    return Math.round((Number(range[1]) + Number(range[2])) / 2);
  }
  const plus = raw.match(/(\d+)\s*\+/);
  if (plus) return Number(plus[1]);
  const n = raw.replace(/[, employeesheadcount]/gi, "").trim();
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

function parseYear(raw: string): number | null {
  const m = raw.match(/(19|20)\d{2}/);
  if (!m) return null;
  const year = Number(m[0]);
  return year >= 1800 && year <= 2026 ? year : null;
}

function parseBusinessType(raw: string): BusinessType {
  if (/\bb2b\b/i.test(raw) && /\bb2c\b/i.test(raw)) return "Both";
  if (/\bb2b\b/i.test(raw) || /business.?to.?business/i.test(raw)) return "B2B";
  if (/\bb2c\b/i.test(raw) || /consumer/i.test(raw)) return "B2C";
  return "Unknown";
}

export function domainFromWebsite(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase() || null;
  }
}

function filledCount(company: Company): number {
  return [
    company.website,
    company.email,
    company.phone,
    company.ownerName,
    company.linkedinUrl,
    company.estimatedRevenueUsd,
    company.employeeCount,
    company.yearFounded,
    company.description,
  ].filter((v) => v != null && v !== "").length;
}

function mergeCompanies(a: Company, b: Company): Company {
  const [primary, secondary] =
    filledCount(a) >= filledCount(b) ? [a, b] : [b, a];
  return {
    ...primary,
    website: primary.website || secondary.website,
    phone: primary.phone || secondary.phone,
    email: primary.email || secondary.email,
    linkedinUrl: primary.linkedinUrl || secondary.linkedinUrl,
    ownerName: primary.ownerName || secondary.ownerName,
    ownerTitle: primary.ownerTitle || secondary.ownerTitle,
    description:
      (primary.description?.length ?? 0) >= (secondary.description?.length ?? 0)
        ? primary.description || secondary.description
        : secondary.description || primary.description,
    industry: primary.industry || secondary.industry,
    category: primary.category || secondary.category,
    city: primary.city || secondary.city,
    state: primary.state || secondary.state,
    estimatedRevenueUsd: primary.estimatedRevenueUsd ?? secondary.estimatedRevenueUsd,
    employeeCount: primary.employeeCount ?? secondary.employeeCount,
    yearFounded: primary.yearFounded ?? secondary.yearFounded,
  };
}

function slugId(name: string, idx: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `imp-${slug || "row"}-${idx}`;
}

function emptyCompany(id: string): Company {
  return {
    id,
    name: "",
    industry: "",
    category: "",
    description: "",
    city: "",
    state: "",
    country: "USA",
    website: null,
    phone: null,
    email: null,
    linkedinUrl: null,
    estimatedRevenueUsd: null,
    employeeCount: null,
    yearFounded: null,
    businessType: "Unknown",
    ownerName: null,
    ownerTitle: null,
    triggerType: "none" as TriggerType,
    triggerSummary: null,
    triggerDate: null,
  };
}

function rowToCompany(
  record: Record<string, string>,
  idx: number
): Company | null {
  const name = pick(record, "name");
  if (!name) return null;

  let city = pick(record, "city");
  let state = normalizeStateToken(pick(record, "state")) ?? pick(record, "state");
  const location = pick(record, "location");
  if ((!city || !state) && location) {
    const parsed = parseLocation(location);
    city = city || parsed.city;
    state = state || parsed.state;
  }

  const first = pick(record, "firstName");
  const last = pick(record, "lastName");
  const owner = pick(record, "owner") || [first, last].filter(Boolean).join(" ");

  const websiteRaw = pick(record, "website");
  const website = websiteRaw
    ? websiteRaw.startsWith("http")
      ? websiteRaw
      : `https://${websiteRaw}`
    : null;

  const industry = pick(record, "industry");
  const category = pick(record, "category") || industry;

  const company: Company = {
    ...emptyCompany(slugId(name, idx)),
    name,
    industry,
    category,
    description: pick(record, "description"),
    city,
    state,
    country: pick(record, "country") || "USA",
    website,
    phone: pick(record, "phone") || null,
    email: pick(record, "email") || null,
    linkedinUrl: pick(record, "linkedin") || null,
    estimatedRevenueUsd: parseMoneyCell(pick(record, "revenue")),
    employeeCount: parseEmployeeCell(pick(record, "employees")),
    yearFounded: parseYear(pick(record, "yearFounded")),
    businessType: parseBusinessType(
      `${pick(record, "businessType")} ${pick(record, "description")} ${industry}`
    ),
    ownerName: owner || null,
    ownerTitle: pick(record, "title") || null,
  };
  return company;
}

function dedupeKey(company: Company): string {
  const domain = domainFromWebsite(company.website);
  if (domain) return `d:${domain}`;
  const email = company.email?.trim().toLowerCase();
  if (email) return `e:${email}`;
  return `n:${company.name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${company.state.toLowerCase()}`;
}

export function ingestCsv(csvText: string): {
  companies: Company[];
  stats: IngestStats;
} {
  const table = parseCsv(csvText);
  if (table.length < 2) {
    return {
      companies: [],
      stats: {
        rows: 0,
        unique: 0,
        duplicatesCollapsed: 0,
        skipped: 0,
        mapped: [],
        unmapped: [],
        missingEmail: 0,
        missingPhone: 0,
        readyToCall: 0,
      },
    };
  }

  const headers = table[0].map(normalizeHeader);
  const aliasToField = new Map<string, string>();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) aliasToField.set(alias, field);
  }

  const mapped = new Set<string>();
  const unmapped: string[] = [];
  for (const h of headers) {
    if (!h) continue;
    const field = aliasToField.get(h);
    if (field) mapped.add(field);
    else if (!unmapped.includes(h)) unmapped.push(h);
  }

  const body = table.slice(1, MAX_ROWS + 1);
  const parsed: Company[] = [];
  let skipped = 0;

  for (let i = 0; i < body.length; i++) {
    const record: Record<string, string> = {};
    const cells = [...body[i]];
    while (cells.length < headers.length) cells.push("");
    headers.forEach((h, idx) => {
      if (h) record[h] = cells[idx] ?? "";
    });
    const company = rowToCompany(record, i + 1);
    if (!company) {
      skipped += 1;
      continue;
    }
    parsed.push(company);
  }

  const byKey = new Map<string, Company>();
  let duplicatesCollapsed = 0;
  for (const company of parsed) {
    const key = dedupeKey(company);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, mergeCompanies(existing, company));
      duplicatesCollapsed += 1;
    } else {
      byKey.set(key, company);
    }
  }

  const companies = Array.from(byKey.values());
  const missingEmail = companies.filter((c) => !c.email).length;
  const missingPhone = companies.filter((c) => !c.phone).length;
  const readyToCall = companies.filter(
    (c) => c.ownerName && (c.email || c.phone)
  ).length;

  return {
    companies,
    stats: {
      rows: body.length,
      unique: companies.length,
      duplicatesCollapsed,
      skipped,
      mapped: Array.from(mapped),
      unmapped,
      missingEmail,
      missingPhone,
      readyToCall,
    },
  };
}

export function isLikelyCompany(value: unknown): value is Company {
  if (!value || typeof value !== "object") return false;
  const v = value as Company;
  return typeof v.id === "string" && typeof v.name === "string";
}

export function sanitizeCompanies(input: unknown): Company[] | null {
  if (!Array.isArray(input)) return null;
  const out: Company[] = [];
  for (const row of input) {
    if (!isLikelyCompany(row)) continue;
    out.push({
      ...emptyCompany(row.id),
      ...row,
      name: String(row.name),
    });
  }
  return out;
}
