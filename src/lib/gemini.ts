import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
].filter(Boolean) as string[];

const RETRIES_PER_MODEL = 2;
const RETRY_BASE_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(message: string) {
  return /503|429|high demand|unavailable|temporar|resource.?exhausted|overloaded/i.test(
    message
  );
}

function isSkipModel(message: string) {
  return /404|not found|no longer available|not supported/i.test(message);
}

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to .env.local and restart the server."
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

export function getGeminiModel(model = MODEL_CANDIDATES[0]): GenerativeModel {
  return getGeminiClient().getGenerativeModel({ model });
}

export async function generateGeminiText(
  prompt: string,
  options?: { temperature?: number; json?: boolean }
): Promise<{ text: string; model: string }> {
  const client = getGeminiClient();
  const errors: string[] = [];

  for (const modelName of MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < RETRIES_PER_MODEL; attempt++) {
      try {
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options?.temperature ?? 0.3,
            ...(options?.json
              ? { responseMimeType: "application/json" as const }
              : {}),
          },
        });
        return { text: result.response.text(), model: modelName };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const short = message.replace(/\s+/g, " ").slice(0, 160);
        errors.push(`${modelName}#${attempt + 1}: ${short}`);

        if (isSkipModel(message)) break;
        if (isRetryable(message) && attempt < RETRIES_PER_MODEL - 1) {
          await sleep(RETRY_BASE_MS * (attempt + 1));
          continue;
        }
        if (!isRetryable(message) && !isSkipModel(message)) {
          // auth / quota hard fail - don't burn every model
          if (/api key|permission|401|403|invalid/i.test(message)) {
            throw new Error(short);
          }
        }
        break;
      }
    }
  }

  throw new Error(
    `Gemini is temporarily overloaded. Tried ${MODEL_CANDIDATES.length} models. ${errors[0] ?? ""}`
  );
}

export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model did not return JSON");
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
