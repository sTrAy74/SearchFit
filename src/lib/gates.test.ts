import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseThesisLocally } from "./localThesis";
import { scoreCompany, takeShortlist } from "./scoring";
import type { Company, Thesis } from "./types";

const thesis: Thesis = {
  industries: ["HVAC"],
  states: ["TX"],
  revenueMin: 2_000_000,
  revenueMax: 12_000_000,
  employeeMin: 10,
  employeeMax: 80,
  businessTypes: ["B2B"],
  mustHaveKeywords: ["recurring"],
  excludeKeywords: ["crypto", "staffing"],
  topN: 15,
};

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "t1",
    name: "Summit Mechanical",
    industry: "HVAC",
    category: "Mechanical",
    description: "Recurring commercial HVAC maintenance for property managers.",
    city: "Austin",
    state: "TX",
    country: "USA",
    website: "https://summit.example",
    phone: "(512) 555-0100",
    email: "maria@summit.example",
    linkedinUrl: "https://www.linkedin.com/company/summit",
    estimatedRevenueUsd: 5_000_000,
    employeeCount: 28,
    yearFounded: 1998,
    businessType: "B2B",
    ownerName: "Maria Gonzalez",
    ownerTitle: "Owner",
    triggerType: "funding",
    triggerSummary: "Closed a small growth round to add a second crew.",
    triggerDate: "2026-03-01",
    ...overrides,
  };
}

describe("ICP gates", () => {
  it("calls an account that fits industry, revenue, and has a decision-maker", () => {
    const row = scoreCompany(company(), thesis);
    assert.equal(row.action, "call");
    assert.ok(row.score >= 45);
  });

  it("skips a wrong industry even when the account is complete and has a why-now", () => {
    const row = scoreCompany(
      company({
        name: "Bright Smile Pediatrics",
        industry: "Dental",
        category: "Healthcare",
        description: "Pediatric dental offices with recurring hygiene plans.",
      }),
      thesis
    );
    assert.equal(row.action, "skip");
    assert.match(row.actionReason, /industry/i);
    assert.ok(row.score < 45);
  });

  it("skips revenue far outside the band and still calls a near miss", () => {
    const far = scoreCompany(company({ estimatedRevenueUsd: 80_000_000 }), thesis);
    assert.equal(far.action, "skip");
    assert.match(far.actionReason, /revenue/i);

    const near = scoreCompany(company({ estimatedRevenueUsd: 14_000_000 }), thesis);
    assert.equal(near.action, "call");
  });

  it("skips an excluded keyword and enriches a fit that has no contact", () => {
    const excluded = scoreCompany(
      company({
        description: "HVAC contractor that also runs a crypto payments desk.",
      }),
      thesis
    );
    assert.equal(excluded.action, "skip");
    assert.match(excluded.actionReason, /excluded/i);

    const needsCredit = scoreCompany(
      company({ email: null, phone: null, ownerName: null }),
      thesis
    );
    assert.equal(needsCredit.action, "enrich");
  });

  it("keeps skips out of the default export cut", () => {
    const rows = [
      scoreCompany(company({ id: "fit" }), thesis),
      scoreCompany(
        company({
          id: "wrong",
          name: "Bright Smile Pediatrics",
          industry: "Dental",
          category: "Healthcare",
          description: "Pediatric dental offices with recurring hygiene plans.",
        }),
        thesis
      ),
    ];
    const queue = takeShortlist(rows, 15, ["call", "enrich"]);
    assert.deepEqual(
      queue.map((row) => row.company.id),
      ["fit"]
    );
  });
});

describe("offline ICP parse", () => {
  it("reads a $2–12M revenue range", () => {
    const { thesis: parsed } = parseThesisLocally(
      "B2B HVAC and MSP in Texas, $2–12M revenue, 10–80 employees, recurring service"
    );
    assert.equal(parsed.revenueMin, 2_000_000);
    assert.equal(parsed.revenueMax, 12_000_000);
    assert.equal(parsed.employeeMin, 10);
    assert.equal(parsed.employeeMax, 80);
    assert.ok(parsed.states.includes("TX"));
    assert.ok(parsed.industries.includes("HVAC"));
    assert.ok(parsed.industries.includes("IT Services"));
  });

  it("reads $2M-$12M and $2M to $12M", () => {
    assert.equal(parseThesisLocally("HVAC $2M-$12M").thesis.revenueMin, 2_000_000);
    assert.equal(parseThesisLocally("HVAC $2M-$12M").thesis.revenueMax, 12_000_000);
    assert.equal(parseThesisLocally("HVAC $2M to $12M").thesis.revenueMin, 2_000_000);
    assert.equal(parseThesisLocally("HVAC $2M to $12M").thesis.revenueMax, 12_000_000);
  });
});
