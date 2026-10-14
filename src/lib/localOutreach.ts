import type { ScoredCompany } from "./types";
import { formatMoney } from "./scoring";

export function draftOutreachLocally(
  scored: ScoredCompany,
  tone: "direct" | "professional" | "friendly" = "professional"
): { subject: string; body: string; angle: string } {
  const { company, whyNow, score } = scored;
  const first = company.ownerName?.split(" ")[0] ?? "there";
  const revenue =
    company.estimatedRevenueUsd != null
      ? formatMoney(company.estimatedRevenueUsd)
      : "n/a";

  const greeting =
    tone === "friendly"
      ? `Hi ${first},`
      : tone === "direct"
        ? `${first} -`
        : `Dear ${first},`;

  const why = whyNow
    ? ` I also noticed a timely signal: ${whyNow.replace(/\.$/, "").toLowerCase()}.`
    : "";

  const subject = `Quick question about ${company.name}`;
  const body = `${greeting}

I've been looking at ${company.industry.toLowerCase()} operators in ${company.city}, ${company.state}, and ${company.name} matches the ICP we actually call on (fit ${score}/100; ~$${revenue}${company.employeeCount ? `, ${company.employeeCount} people` : ""}).${why}

If a 20-minute conversation would be useful, I'm free Thursday morning or Friday afternoon next week.

Best regards`;

  return {
    subject,
    body,
    angle: "Local fallback draft using ICP fit + why-now (Gemini unavailable).",
  };
}
