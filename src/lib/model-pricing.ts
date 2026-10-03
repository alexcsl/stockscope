import { LocalStore } from "./local-store";

export interface ModelPrice { model: string; inputPerMillion: string; outputPerMillion: string; verifiedAt: string; sourceUrl: string }
const lifetime = 86400000;
const refreshAfter = 21600000;
const validModel = (model: string) => /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(model);

export function parseModelPrice(html: string, model: string, now = new Date()): ModelPrice | null {
  if (!validModel(model) || html.length > 500000) return null;
  const text = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => match[1].replace(/<[^>]*>/g, "").trim());
  const inputs = [...text.matchAll(/Input price:\s*\$([0-9]+(?:\.[0-9]+)?)\s+per 1M tokens/g)];
  const outputs = [...text.matchAll(/Output price:\s*\$([0-9]+(?:\.[0-9]+)?)\s+per 1M tokens/g)];
  if (headings.length !== 1 || headings[0] !== model || !text.includes(`Model overview Provider:`) || !text.includes("Billing type: Pay as you go") || inputs.length !== 1 || outputs.length !== 1 || /tiered|per request|per image|per second|per minute/i.test(text)) return null;
  const inputPerMillion = inputs[0][1];
  const outputPerMillion = outputs[0][1];
  if (![inputPerMillion, outputPerMillion].every((rate) => Number.isFinite(Number(rate)) && Number(rate) > 0)) return null;
  return { model, inputPerMillion, outputPerMillion, verifiedAt: now.toISOString(), sourceUrl: `https://www.tokenrouter.com/models/${model}/` };
}

export async function modelPrice(model: string, fetcher: typeof fetch = fetch, now = new Date(), directory?: string): Promise<ModelPrice | null> {
  if (!validModel(model)) return null;
  const store = new LocalStore<Record<string, ModelPrice>>("provider-prices", () => ({}), directory);
  const cached = await store.transaction((state) => state[model]);
  const age = cached ? now.getTime() - Date.parse(cached.verifiedAt) : Infinity;
  if (age >= 0 && age < refreshAfter) return cached;
  try {
    const url = `https://www.tokenrouter.com/models/${model}/`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: "error", cache: "no-store" });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || Number(response.headers.get("content-length") || 0) > 500000) throw new Error("pricing_unavailable");
    const price = parseModelPrice(await response.text(), model, now);
    if (!price) throw new Error("pricing_unverified");
    await store.transaction((state) => { state[model] = price; });
    return price;
  } catch { return age >= 0 && age < lifetime ? cached : null; }
}
