import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/companies";
import { sanitizeCompanies } from "@/lib/ingest";
import {
  countActions,
  DEFAULT_QUEUE,
  rankCompanies,
  sanitizeThesis,
  takeShortlist,
} from "@/lib/scoring";
import type { ScoreRequest, ScoreResponse } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScoreRequest;
    const thesis = sanitizeThesis(body.thesis);
    const uploaded = sanitizeCompanies(body.companies);
    let companies = uploaded ?? getCompanies();
    if (body.companyIds?.length) {
      const set = new Set(body.companyIds);
      companies = companies.filter((c) => set.has(c.id));
    }
    const ranked = rankCompanies(companies, thesis);
    const response: ScoreResponse = {
      results: ranked,
      thesis,
      totalScored: companies.length,
      actionCounts: countActions(ranked),
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Invalid score request" },
      { status: 400 }
    );
  }
}

export async function GET() {
  const thesis = sanitizeThesis(undefined);
  const companies = getCompanies();
  const ranked = rankCompanies(companies, thesis);
  const response: ScoreResponse = {
    results: takeShortlist(ranked, thesis.topN, DEFAULT_QUEUE),
    thesis,
    totalScored: companies.length,
    actionCounts: countActions(ranked),
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(response);
}
