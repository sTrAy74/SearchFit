import { NextResponse } from "next/server";
import { extractJson, generateGeminiText } from "@/lib/gemini";
import { draftOutreachLocally } from "@/lib/localOutreach";
import type { ScoredCompany } from "@/lib/types";

type OutreachResponse = {
  subject: string;
  body: string;
  angle: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      scored?: ScoredCompany;
      tone?: "direct" | "professional" | "friendly";
    };

    if (!body.scored?.company) {
      return NextResponse.json(
        { error: "scored company payload required" },
        { status: 400 }
      );
    }

    const scored = body.scored;
    const tone = body.tone ?? "professional";
    const { company, score, grade, reasons, whyNow, outreachOpener } = scored;

    try {
      const { text, model } = await generateGeminiText(
        `Write a short B2B outbound email to this account (NOT a generic spray, NOT a fake "synergies" PE letter).

Tone: ${tone}
Audience: owner/CEO of a private company.
Goal: book a 20-minute discovery call.
Constraints:
- 90–140 words
- No hype, no fake personalization
- Reference real ICP fit signals provided (industry, geo, why-now, size)
- End with a soft CTA offering 2 time windows
- Return ONLY JSON: {"subject":"...","body":"...","angle":"one-line strategy note"}

Company:
${JSON.stringify(
  {
    name: company.name,
    industry: company.industry,
    city: company.city,
    state: company.state,
    revenue: company.estimatedRevenueUsd,
    businessType: company.businessType,
    ownerName: company.ownerName,
    ownerTitle: company.ownerTitle,
    description: company.description,
    fitScore: score,
    grade,
    whyNow,
    reasons,
    starterOpener: outreachOpener,
  },
  null,
  2
)}`,
        { temperature: 0.55, json: true }
      );

      const parsed = extractJson<OutreachResponse>(text);
      if (!parsed.subject || !parsed.body) {
        throw new Error("Incomplete outreach response");
      }

      return NextResponse.json({
        ...parsed,
        model,
        source: "gemini" as const,
      });
    } catch (geminiError) {
      const local = draftOutreachLocally(scored, tone);
      const detail =
        geminiError instanceof Error ? geminiError.message : "Gemini unavailable";
      return NextResponse.json({
        ...local,
        model: "local-template",
        source: "local" as const,
        notice: `Gemini busy - used local outreach template. (${detail.slice(0, 120)})`,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Outreach draft failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
