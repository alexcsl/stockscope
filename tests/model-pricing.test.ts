import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelPrice, parseModelPrice } from "../src/lib/model-pricing";
import { explainEvidence } from "../src/lib/analyst";

const model = "openai/gpt-6-luna";
const now = new Date("2026-10-03T07:00:00Z");
const html = `<h1>${model}</h1><h2>Model overview</h2><p>Provider: OpenAI</p><h2>Pricing</h2><p>Billing type: Pay as you go</p><p>Input price: $0.1000 per 1M tokens</p><p>Output price: $0.5000 per 1M tokens</p>`;
const page = () => new Response(html, { headers: { "Content-Type": "text/html" } });

test("official pricing requires exact model, unambiguous token rates and supported billing", () => {
  assert.equal(parseModelPrice(html, model, now)?.inputPerMillion, "0.1000");
  for (const value of [html.replace(model, "another/model"), html.replace(model, "another/model") + model, html + " Input price: $1 per 1M tokens", html.replace("$0.5000", "$0"), html + " tiered pricing", `<script>${html}</script>`]) assert.equal(parseModelPrice(value, model, now), null);
});

test("pricing is cached, refreshed and expires during a provider outage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stockscope-prices-"));
  let calls = 0;
  const fetcher = (async () => { calls++; return page(); }) as typeof fetch;
  try {
    assert.ok(await modelPrice(model, fetcher, now, directory));
    assert.ok(await modelPrice(model, fetcher, new Date(now.getTime() + 1000), directory));
    assert.equal(calls, 1);
    const failing = (async () => { throw new Error("offline"); }) as typeof fetch;
    assert.ok(await modelPrice(model, failing, new Date(now.getTime() + 21600001), directory));
    assert.equal(await modelPrice(model, failing, new Date(now.getTime() + 86400001), directory), null);
    assert.equal(await modelPrice("../invalid", fetcher, now, directory), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("automatic pricing prevents paid calls when source verification fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stockscope-price-gate-"));
  const urls: string[] = [];
  try {
    const result = await explainEvidence({}, [{ id: 1, label: "Issuer", url: "https://example.com" }], { apiKey: "fixture", model, automaticPricing: true, directory, now: () => now }, (async (url) => { urls.push(String(url)); return new Response("unavailable", { status: 503 }); }) as typeof fetch);
    assert.equal(result.state, "pricing_unverified");
    assert.deepEqual(urls, [`https://www.tokenrouter.com/models/${model}/`]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("verified public rates govern paid usage without exposing the key to the pricing source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stockscope-price-usage-"));
  const urls: string[] = [];
  try {
    const fetcher = (async (url, init) => {
      urls.push(String(url));
      if (String(url).startsWith("https://www.tokenrouter.com/")) {
        assert.equal(new Headers(init?.headers).has("authorization"), false);
        return page();
      }
      return Response.json({ choices: [{ message: { content: "Evidence remains cited. [1]" } }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
    }) as typeof fetch;
    const result = await explainEvidence({}, [{ id: 1, label: "Issuer", url: "https://example.com" }], { apiKey: "fixture", model, automaticPricing: true, inputPerMillion: "9999", outputPerMillion: "9999", directory, now: () => now }, fetcher);
    assert.equal(result.state, "available");
    const stored = JSON.parse(await readFile(join(directory, "analyst.json"), "utf8"));
    assert.equal(stored.months["2026-10"].spent, 25);
    assert.equal(urls.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
