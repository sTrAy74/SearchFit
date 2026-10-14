export const STATE_MAP: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export const REGION_MAP: Record<string, string[]> = {
  "sun belt": ["FL", "TX", "AZ", "GA", "NC"],
  midwest: ["IL", "OH", "MI", "IN", "WI", "MN"],
  northeast: ["NY", "NJ", "MA", "PA", "CT"],
  southeast: ["FL", "GA", "NC", "SC", "TN", "AL"],
  southwest: ["TX", "AZ", "NM", "NV"],
  "west coast": ["CA", "OR", "WA"],
};

const CODE_SET = new Set(Object.values(STATE_MAP));

export function normalizeStateToken(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && CODE_SET.has(upper)) return upper;
  const mapped = STATE_MAP[trimmed.toLowerCase()];
  return mapped ?? null;
}

/** Split "Austin, TX", "Austin TX", or "Dallas, Texas". */
export function parseLocation(raw: string | null | undefined): {
  city: string;
  state: string;
} {
  if (!raw) return { city: "", state: "" };
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const comma = cleaned.match(/^(.+?),\s*(.+)$/);
  if (comma) {
    const state = normalizeStateToken(comma[2]) ?? comma[2].trim();
    return { city: comma[1].trim(), state };
  }
  const parts = cleaned.split(" ");
  if (parts.length >= 2) {
    const maybeState = normalizeStateToken(parts[parts.length - 1]);
    if (maybeState) {
      return { city: parts.slice(0, -1).join(" "), state: maybeState };
    }
  }
  const onlyState = normalizeStateToken(cleaned);
  if (onlyState) return { city: "", state: onlyState };
  return { city: cleaned, state: "" };
}
