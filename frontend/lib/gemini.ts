import { withTimeout } from './timeout';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// An alias rather than a pinned version: Google retires Flash versions, and a retired one would
// silently switch the quiz off. GEMINI_MODEL pins one when needed.
const DEFAULT_MODEL = 'gemini-flash-latest';
// The free tier answers 503 "high demand" often, and a newly launched Flash can hang for a minute
// (gemini-3.8-flash, 2026-10-26). Flash-Lite has its own capacity and answers in seconds.
const FALLBACK_MODEL = 'gemini-flash-lite-latest';
const PRIMARY_TIMEOUT_MS = 15_000;
const FALLBACK_TIMEOUT_MS = 30_000;
// 404: the model was retired.
const TRY_NEXT = new Set([404, 429, 500, 503]);

export const geminiConfigured = (): boolean => Boolean(process.env.GEMINI_API_KEY);

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
}

interface GeminiRequest {
  system: string;
  prompt: string;
  /** Gemini's OpenAPI subset. */
  schema: Record<string, unknown>;
}

/** One JSON reply constrained to `schema`. Throws on any failure. */
export async function geminiJson(opts: GeminiRequest): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const attempts: Array<[string, number]> = [
    [process.env.GEMINI_MODEL || DEFAULT_MODEL, PRIMARY_TIMEOUT_MS],
    [FALLBACK_MODEL, FALLBACK_TIMEOUT_MS],
  ];

  let last: unknown;
  for (const [model, timeoutMs] of attempts) {
    try {
      return await generate(model, key, opts, timeoutMs);
    } catch (err) {
      last = err;
      const next = err instanceof GeminiError ? TRY_NEXT.has(err.status) : err instanceof Error && err.name === 'TimeoutError';
      if (!next) throw err;
    }
  }
  throw last;
}

class GeminiError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`Gemini ${status}: ${detail.slice(0, 300)}`);
  }
}

async function generate(model: string, key: string, opts: GeminiRequest, timeoutMs: number): Promise<unknown> {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: opts.schema },
    }),
    cache: 'no-store',
    signal: withTimeout(timeoutMs),
  });
  if (!res.ok) throw new GeminiError(res.status, await res.text());

  const body = (await res.json()) as GeminiResponse;
  const text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned no text');
  return JSON.parse(text);
}
