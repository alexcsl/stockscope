import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { explainEvidence, type AnalystConfig } from "../src/lib/analyst";

const references = [{ id: 1, label: "Issuer", url: "https://example.com/issuer" }];
async function config(): Promise<AnalystConfig> { return { apiKey: "test", verifiedAt: "2026-09-26T00:00:00Z", inputPerMillion: "0.039", outputPerMillion: "0.18", now: () => new Date("2026-09-26T01:00:00Z"), directory: await mkdtemp(join(tmpdir(), "stockscope-budget-")) }; }
const response = () => Response.json({ choices: [{ message: { content: "Issuer reference is available; a quote is still required. [1]" } }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
test("credentials and verified pricing gate paid requests", async () => {
  assert.equal((await explainEvidence({}, references, {})).state, "not_configured");
  assert.equal((await explainEvidence({}, references, { apiKey: "key" })).state, "pricing_unverified");
});
test("cached explanation and budget persist across store instances", async () => {
  const settings = await config();
  let calls = 0;
  const fetcher = (async () => { calls++; return response(); }) as typeof fetch;
  assert.equal((await explainEvidence({ value: 1 }, references, settings, fetcher)).state, "available");
  const cached = await explainEvidence({ value: 1 }, references, { ...settings }, fetcher);
  assert.equal(cached.state, "available");
  assert.equal(calls, 1);
});
test("concurrent requests reserve atomically and admit only one provider call", async () => {
  const settings = await config();
  const fetcher = (async () => { await new Promise((resolve) => setTimeout(resolve, 100)); return response(); }) as typeof fetch;
  const results = await Promise.all([explainEvidence({ value: 1 }, references, settings, fetcher), explainEvidence({ value: 2 }, references, settings, fetcher)]);
  assert.deepEqual(results.map((item) => item.state).sort(), ["available", "busy"]);
});
test("excessive reserve refuses provider call and unknown usage remains charged", async () => {
  const settings = await config();
  const expensive = { ...settings, inputPerMillion: "100000" };
  assert.equal((await explainEvidence({}, references, expensive)).state, "budget_exhausted");
  let calls = 0;
  const failing = (async () => { calls++; throw new Error("timeout"); }) as typeof fetch;
  assert.equal((await explainEvidence({}, references, settings, failing)).state, "provider_failed");
  assert.equal(calls, 1);
  const stored = JSON.parse(await readFile(join(settings.directory!, "analyst.json"), "utf8"));
  assert.ok(stored.months["2026-09"].spent > 0);
  assert.equal(stored.months["2026-09"].active, null);
});
test("invalid citations and unbounded usage are rejected", async () => {
  for (const payload of [{ choices: [{ message: { content: "Made-up evidence. [9]" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }, { choices: [{ message: { content: "Evidence. [1]" } }], usage: { prompt_tokens: 100, completion_tokens: 9000 } }]) assert.equal((await explainEvidence({}, references, await config(), (async () => Response.json(payload)) as typeof fetch)).state, "invalid_response");
});

test("the configured model is sent to the provider and caps above one dollar are refused", async () => {
  const settings = await config();
  const fetcher = (async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).model, "openai/gpt-6-luna");
    assert.equal(JSON.parse(String(init?.body)).max_completion_tokens, 512);
    assert.equal(JSON.parse(String(init?.body)).max_tokens, undefined);
    return response();
  }) as typeof fetch;
  const result = await explainEvidence({}, references, { ...settings, model: "openai/gpt-6-luna", monthlyLimitUsd: "1" }, fetcher);
  assert.equal(result.state, "available");
  assert.equal((await explainEvidence({}, references, { ...settings, monthlyLimitUsd: "2" }, fetcher)).state, "budget_exhausted");
});
