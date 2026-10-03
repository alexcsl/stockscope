import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.STOCKSCOPE_DATA_DIR = await mkdtemp(join(tmpdir(), "stockscope-rate-"));
const { guardRequest, readSmallBody } = await import("../src/lib/request-guard");

test("provider request quota is persistent and rejects cross-origin mutations", async () => {
  const request = new Request("http://localhost/api/trade/prepare", { method: "POST", headers: { origin: "http://localhost" }, body: "{}" });
  assert.equal(await guardRequest(request, "test", 2), null);
  assert.equal(await guardRequest(request, "test", 2), null);
  assert.equal((await guardRequest(request, "test", 2))?.status, 429);
  assert.equal((await guardRequest(new Request(request.url, { headers: { origin: "https://other.example" } }), "other"))?.status, 403);
});
test("same-origin checks use the incoming host when Next normalizes the request URL", async () => {
  const url = "http://localhost:3101/api/market/uniswap";
  const headers = { host: "127.0.0.1:3101", origin: "http://127.0.0.1:3101" };
  assert.equal(await guardRequest(new Request(url, { headers }), "loopback"), null);
  for (const origin of ["http://localhost:3101", "http://127.0.0.1:3100", "https://other.example"]) {
    assert.equal((await guardRequest(new Request(url, { headers: { ...headers, origin } }), "rejected"))?.status, 403);
  }
  assert.equal((await guardRequest(new Request(url, { headers: { ...headers, "sec-fetch-site": "cross-site" } }), "cross-site"))?.status, 403);
});

test("public Vercel requests cannot use local storage or enable operator actions", async () => {
  const previousHost = process.env.VERCEL;
  const previousOperator = process.env.STOCKSCOPE_LOCAL_OPERATOR;
  try {
    process.env.VERCEL = "1";
    process.env.STOCKSCOPE_LOCAL_OPERATOR = "1";
    const { operatorEnabled } = await import("../src/lib/operator-access");
    const { readEvidence } = await import("../src/lib/evidence-store");
    const response = await guardRequest(new Request("https://stockscope.example/api/market/uniswap", { headers: { origin: "https://stockscope.example" } }), "hosted");
    assert.equal(response?.status, 503);
    assert.equal((await response?.json()).state, "not_configured");
    assert.equal(operatorEnabled(), false);
    assert.equal(await readEvidence(`0x${"1".repeat(64)}`), null);
  } finally {
    if (previousHost === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousHost;
    if (previousOperator === undefined) delete process.env.STOCKSCOPE_LOCAL_OPERATOR; else process.env.STOCKSCOPE_LOCAL_OPERATOR = previousOperator;
  }
});

test("body limit applies even without a content-length header", async () => {
  await assert.rejects(readSmallBody(new Request("http://localhost/api", { method: "POST", body: "x".repeat(8193) })));
  assert.deepEqual(await readSmallBody(new Request("http://localhost/api", { method: "POST", body: "{\"a\":1}" })), { a: 1 });
});
