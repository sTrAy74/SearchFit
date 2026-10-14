import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/companies";
import { scoredToCsv } from "@/lib/csv";
import { sanitizeCompanies } from "@/lib/ingest";
import {
  DEFAULT_QUEUE,
  rankCompanies,
  sanitizeThesis,
  takeShortlist,
} from "@/lib/scoring";
import type { Company, OutreachAction, Thesis } from "@/lib/types";

const ACTIONS = new Set<OutreachAction>(["call", "enrich", "skip"]);

function parseActions(value: unknown): OutreachAction[] {
  if (!Array.isArray(value)) return DEFAULT_QUEUE;
  const actions = value.filter(
    (item): item is OutreachAction =>
      typeof item === "string" && ACTIONS.has(item as OutreachAction)
  );
  return actions.length ? actions : DEFAULT_QUEUE;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      thesis?: Partial<Thesis>;
      companies?: Company[];
      actions?: OutreachAction[];
    };
    const thesis = sanitizeThesis(body.thesis);
    const companies = sanitizeCompanies(body.companies) ?? getCompanies();
    const results = takeShortlist(
      rankCompanies(companies, thesis),
      thesis.topN,
      parseActions(body.actions)
    );
    const csv = scoredToCsv(results);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="searchfit-shortlist.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Export failed" }, { status: 400 });
  }
}
