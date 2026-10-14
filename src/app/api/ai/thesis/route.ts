import { NextResponse } from "next/server";
import { extractJson, generateGeminiText } from "@/lib/gemini";
import { parseThesisLocally } from "@/lib/localThesis";
import { DEFAULT_THESIS } from "@/lib/scoring";
import type { Thesis } from "@/lib/types";

type ThesisAiResponse = Partial<Thesis> & { summary?: string };

function normalizeThesis(parsed: ThesisAiResponse, fallbackPrompt: string) {
  const thesis: Thesis = {
    industries: parsed.industries ?? [],
    states: parsed.states ?? [],
    revenueMin: parsed.revenueMin ?? null,
    revenueMax: parsed.revenueMax ?? null,
    employeeMin: parsed.employeeMin ?? null,
    employeeMax: parsed.employeeMax ?? null,
    businessTypes: parsed.businessTypes?.length
      ? parsed.businessTypes
      : ["B2B"],
    mustHaveKeywords: parsed.mustHaveKeywords ?? [],
    excludeKeywords: parsed.excludeKeywords ?? [],
    topN: Math.min(50, Math.max(1, Number(parsed.topN) || 15)),
  };
  return {
    thesis,
    summary: parsed.summary ?? fallbackPrompt,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    try {
      const { text, model } = await generateGeminiText(
        `You help B2B sales teams (and search operators) turn a plain-English ICP into structured filters.

Return ONLY valid JSON with this shape:
{
  "industries": string[],
  "states": string[] (2-letter US codes when possible),
  "revenueMin": number|null (USD),
  "revenueMax": number|null (USD),
  "employeeMin": number|null,
  "employeeMax": number|null,
  "businessTypes": ("B2B"|"B2C"|"Both")[],
  "mustHaveKeywords": string[],
  "excludeKeywords": string[],
  "topN": number (1-50),
  "summary": string (one sentence restating the ICP)
}

Rules:
- Prefer realistic SMB / lower-middle-market bands (often $1M–$20M, 10–120 employees) unless the user specifies otherwise.
- If geo is vague ("Sun Belt"), expand to a few representative state codes.
- Keep keyword lists short (3–8 items).
- Do not invent irrelevant industries.
- Only put items in excludeKeywords when the user explicitly says to avoid/exclude them.
- If the user does not mention exclusions, return "excludeKeywords": [].

User ICP:
"""${prompt}"""

Default reference (use only if user is vague - do not copy excludeKeywords unless the user asked):
${JSON.stringify({ ...DEFAULT_THESIS, excludeKeywords: [] })}`,
        { temperature: 0.2, json: true }
      );

      const parsed = extractJson<ThesisAiResponse>(text);
      const normalized = normalizeThesis(parsed, prompt);
      return NextResponse.json({
        ...normalized,
        model,
        source: "gemini" as const,
      });
    } catch (geminiError) {
      const local = parseThesisLocally(prompt);
      const detail =
        geminiError instanceof Error ? geminiError.message : "Gemini unavailable";
      return NextResponse.json({
        ...local,
        model: "local-heuristic",
        source: "local" as const,
        notice: `Gemini busy - used offline thesis parser. (${detail.slice(0, 120)})`,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Thesis parse failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
