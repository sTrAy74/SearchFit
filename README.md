# SearchFit

**Rank your lead list. Decide Call, Enrich, or Skip before you spend a credit.**

SearchFit is a Quality-First companion for SaaSquatch-style lead exports. SaaSquatch is strong at discovery and enrichment; SearchFit sits one step later in the workflow: import a CSV, apply an ICP, score each account, and tell you what to do next so enrichment credits and call time go to the right companies.

## Why this exists

Lead-gen tools scrape and enrich at scale. The expensive part is not finding more rows — it is deciding which rows deserve a credit, a call, or nothing.

SearchFit focuses on that decision:

1. **Import** a SaaSquatch (or similar) CSV
2. **Deduplicate** companies and map messy columns
3. **Filter** by ICP (industry, geo, revenue, headcount, keywords)
4. **Score** with explainable reasons
5. **Triage** into Call / Enrich / Skip
6. **Export** a shortlist CSV for outreach or CRM

## Demo flow (2 minutes)

1. Open the app → sample list is already ranked
2. Or click **Load sample SaaSquatch export** / upload your own CSV
3. Adjust filters, or use **Describe in words** for an AI ICP
4. Review the Call / Enrich / Skip queue
5. Open a row → copy opener or **Generate email**
6. **Export** the shortlist

## Setup

### Requirements

- Node.js 20+
- npm
- Optional: [Google AI Studio](https://aistudio.google.com/apikey) key for Gemini (AI ICP + outreach). Offline heuristics run if the key is missing or Gemini fails.

### Install & run

```bash
cd searchfit
npm install
cp .env.local.example .env.local
# optional: set GEMINI_API_KEY=...
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local Next.js server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm test` | ICP gate / scoring tests |
| `npm run lint` | ESLint |

## Dataset

| File | What it is |
|---|---|
| `public/sample-saasquatch-export.csv` | Synthetic SaaSquatch-shaped export (for demos + merge/dedupe tests) |
| `src/data/companies.json` | Seed universe (~52 companies) used when no CSV is imported |

Both are synthetic / demo data — safe to ship with the repo.

## Features

- **CSV ingest** with flexible column aliases (Company Name, Domain, Annual Revenue, Work Email, etc.)
- **Dedup + merge** by domain / email / name+state
- **ICP filters**: industries, states, revenue band, headcount, B2B/B2C, must-have / exclude keywords
- **AI thesis**: plain-English ICP → structured filters (Gemini, with local fallback)
- **Explainable scoring** (industry, revenue, geo, completeness, why-now, established)
- **Call / Enrich / Skip** recommendations tied to contact completeness and ICP gates
- **Outreach drafts** (Gemini or local template)
- **CSV export** of the reviewed shortlist

## UX design choices

- One job on the first screen: rank → decide → export
- Actions are the primary language (Call / Enrich / Skip), not just a score number
- Score breakdown and reasons stay visible so sales users can trust the sort
- Import stats (duplicates merged, missing email/phone, ready-to-call) surface data quality immediately
- Filters update the list immediately so the ICP loop stays fast

## Architecture

### Stack

| Layer | Technology |
|---|---|
| UI | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Fonts | Outfit (display), Source Sans 3 (body) |
| Language | TypeScript |
| AI | Google Gemini (`@google/generative-ai`) + local heuristic fallbacks |
| Scoring / ingest | Pure TypeScript libs (`src/lib/scoring.ts`, `src/lib/ingest.ts`) |
| Tests | Node test runner via `tsx` |

### Data storage

- **No external database** for the 5-hour build — intentional.
- Seed data: `src/data/companies.json` (read at score/export time).
- Imported CSVs: parsed in-memory via `/api/ingest`, held in client state for the session.
- Rationale: zero ops cost, instant demo, clear product boundary (ranking layer, not a CRM).

### Caching & performance

- Local client-side re-score on filter changes for a snappy ICP loop
- Server `/api/score` used for imported universes / API parity
- Ingest capped (e.g. ~2500 rows) to keep browser + serverless payloads safe
- AI routes fail soft to local parsers/templates so the product still works offline

### API routes

| Route | Role |
|---|---|
| `POST /api/ingest` | Parse CSV → companies + stats |
| `POST /api/score` | Rank companies against a thesis |
| `POST /api/export` | Download shortlist CSV |
| `POST /api/ai/thesis` | Natural language → ICP filters |
| `POST /api/ai/outreach` | Draft outreach email for a scored row |

### Hosting & deployment

| Choice | Detail |
|---|---|
| Hosting model | **Serverless** Next.js (not a static SPA) — API routes need a Node runtime |
| Recommended cloud | **Vercel** (Next.js-native) |
| Alternatives | Any Node host (Railway, Fly.io, AWS Amplify) |
| Deploy | Push to GitHub → import on Vercel → set `GEMINI_API_KEY` → deploy |
| Static assets | Sample CSV + fonts served from `public/` / `next/font` |

```text
CSV / seed JSON
      │
      ▼
 /api/ingest  ──►  Company[] (+ dedupe stats)
      │
      ▼
 Filters (Thesis)  ──►  /api/score or local rankCompanies()
      │
      ▼
 ScoredCompany[]  ──►  Call | Enrich | Skip UI
      │
      ├── /api/ai/outreach (optional)
      └── /api/export → shortlist CSV
```

## Project layout

```text
searchfit/
├── public/sample-saasquatch-export.csv
├── src/
│   ├── app/                 # pages + API routes
│   ├── components/          # FilterBar, ShortlistTable, UniverseBar, …
│   ├── data/companies.json  # seed universe
│   └── lib/                 # ingest, scoring, gemini, csv, geo
├── .env.local.example
└── README.md
```

## Product strategy (challenge alignment)

- **Approach:** Quality First — one high-impact layer, not a clone of the scraper
- **Business gap addressed:** credit waste and low-signal outreach after bulk scrape/enrich
- **Sales workflow fit:** export shortlist → CRM / dialer / email tool
- **What we deliberately did not rebuild:** Google Maps / website scraping, captcha bypass, enrichment APIs

---

> SearchFit: spend the next enrichment credit on a fit, not a maybe.
