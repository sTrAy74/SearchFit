export type BusinessType = "B2B" | "B2C" | "Both" | "Unknown";

export type TriggerType =
  | "funding"
  | "leadership_change"
  | "hiring_surge"
  | "news"
  | "none";

export type OutreachAction = "call" | "enrich" | "skip";

export interface Company {
  id: string;
  name: string;
  industry: string;
  category: string;
  description: string;
  city: string;
  state: string;
  country: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  estimatedRevenueUsd: number | null;
  employeeCount: number | null;
  yearFounded: number | null;
  businessType: BusinessType;
  ownerName: string | null;
  ownerTitle: string | null;
  triggerType: TriggerType;
  triggerSummary: string | null;
  triggerDate: string | null;
}

/** ICP filters. Named "thesis" in the API for backwards compatibility. */
export interface Thesis {
  industries: string[];
  states: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  employeeMin: number | null;
  employeeMax: number | null;
  businessTypes: BusinessType[];
  mustHaveKeywords: string[];
  excludeKeywords: string[];
  topN: number;
}

export interface ScoreBreakdown {
  industryKeyword: number;
  revenue: number;
  employees: number;
  geo: number;
  completeness: number;
  whyNow: number;
  established: number;
  penalties: number;
}

export interface ScoredCompany {
  company: Company;
  score: number;
  grade: "A" | "B" | "C" | "D";
  breakdown: ScoreBreakdown;
  reasons: string[];
  outreachOpener: string;
  whyNow: string | null;
  action: OutreachAction;
  actionReason: string;
}

export interface ScoreRequest {
  thesis: Thesis;
  companyIds?: string[];
  companies?: Company[];
}

export interface ActionCounts {
  call: number;
  enrich: number;
  skip: number;
}

export interface ScoreResponse {
  results: ScoredCompany[];
  thesis: Thesis;
  totalScored: number;
  actionCounts: ActionCounts;
  generatedAt: string;
}

export interface IngestStats {
  rows: number;
  unique: number;
  duplicatesCollapsed: number;
  skipped: number;
  mapped: string[];
  unmapped: string[];
  missingEmail: number;
  missingPhone: number;
  readyToCall: number;
}

export interface IngestResponse {
  companies: Company[];
  stats: IngestStats;
}
