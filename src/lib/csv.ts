import type { ScoredCompany } from "./types";
import { formatMoney } from "./scoring";

function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function scoredToCsv(rows: ScoredCompany[]): string {
  const headers = [
    "rank",
    "score",
    "grade",
    "action",
    "action_reason",
    "company",
    "industry",
    "city",
    "state",
    "revenue",
    "employees",
    "year_founded",
    "business_type",
    "website",
    "linkedin",
    "phone",
    "email",
    "owner",
    "owner_title",
    "why_now",
    "top_reasons",
    "outreach_opener",
  ];

  const lines = [headers.join(",")];
  rows.forEach((row, idx) => {
    lines.push(
      [
        idx + 1,
        row.score,
        row.grade,
        row.action,
        row.actionReason,
        row.company.name,
        row.company.industry,
        row.company.city,
        row.company.state,
        row.company.estimatedRevenueUsd != null
          ? formatMoney(row.company.estimatedRevenueUsd)
          : "",
        row.company.employeeCount ?? "",
        row.company.yearFounded ?? "",
        row.company.businessType,
        row.company.website ?? "",
        row.company.linkedinUrl ?? "",
        row.company.phone ?? "",
        row.company.email ?? "",
        row.company.ownerName ?? "",
        row.company.ownerTitle ?? "",
        row.whyNow ?? "",
        row.reasons.slice(0, 3).join(" | "),
        row.outreachOpener,
      ]
        .map(escapeCell)
        .join(",")
    );
  });
  return lines.join("\n");
}
