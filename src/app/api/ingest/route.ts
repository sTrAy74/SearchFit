import { NextResponse } from "next/server";
import { ingestCsv } from "@/lib/ingest";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { csv?: string };
    const csv = body.csv?.trim();
    if (!csv) {
      return NextResponse.json({ error: "CSV text is required" }, { status: 400 });
    }
    const result = ingestCsv(csv);
    if (!result.companies.length) {
      return NextResponse.json(
        {
          error:
            "No companies found. Need a header row plus at least one row with a company name.",
          stats: result.stats,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Ingest failed" }, { status: 400 });
  }
}
