import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVenuePairs } from "../src/lib/venue-market";
import { evaluateResearch, instrumentKey, readResearchState, type ResearchSnapshot } from "../src/lib/research-state";
import { parseXStock } from "../src/lib/xstocks-catalog";

const token = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
const quote = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const pool = "0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D";
const checkedAt = "2026-09-28T10:00:00.000Z";

test("venue records require exact chain, token, quote and V3 pair identity", () => {
  const pair = { chainId: "robinhood", dexId: "uniswap", labels: ["v3"], pairAddress: pool, baseToken: { address: token, symbol: "AAPL" }, quoteToken: { address: quote, symbol: "USDG" }, pairCreatedAt: Date.parse("2026-09-01T00:00:00Z"), txns: { h1: { buys: 12, sells: 8 } }, volume: { h1: 1200, h24: 23000 }, liquidity: { usd: 50000 } };
  assert.equal(parseVenuePairs([pair], 4663, token, quote, checkedAt).length, 1);
  assert.equal(parseVenuePairs([{ ...pair, labels: ["v4"] }], 4663, token, quote, checkedAt).length, 0);
  assert.equal(parseVenuePairs([{ ...pair, quoteToken: { address: token } }], 4663, token, quote, checkedAt).length, 0);
  assert.equal(parseVenuePairs([{ ...pair, chainId: "arbitrum" }], 4663, token, quote, checkedAt).length, 0);
  assert.equal(parseVenuePairs([pair], 4663, token, token, checkedAt).length, 0);
});

test("xStocks listing only admits one exact Arbitrum deployment", () => {
  const row = { symbol: "NVDAx", name: "NVIDIA xStock", underlyingSymbol: "NVDA", trading: { currency: "USD" }, deployments: [{ network: "Arbitrum", address: token }] };
  assert.equal(parseXStock(row)?.contract, token);
  assert.equal(parseXStock({ ...row, deployments: [...row.deployments, ...row.deployments] }), null);
  assert.equal(parseXStock({ ...row, trading: { currency: "EUR" } }), null);
});

test("alerts require observed transitions and retain their evidence without duplicates", () => {
  const assetKey = instrumentKey("robinhood", 4663, token);
  const initial = readResearchState(null);
  initial.rules = [
    { id: "liquidity", assetKey, kind: "liquidity_below", threshold: 100 },
    { id: "health", assetKey, kind: "source_unavailable" },
    { id: "event", assetKey, kind: "issuer_event" },
  ];
  const baseline: ResearchSnapshot = { source: "available", liquidityUsd: 120, pairUrl: "https://dexscreener.com/robinhood/pair", eventsAvailable: true, eventIds: ["old"], checkedAt };
  const first = evaluateResearch(initial, assetKey, baseline);
  assert.equal(first.alerts.length, 0);
  const next = { ...baseline, liquidityUsd: 90, eventIds: ["old", "new"], checkedAt: "2026-09-28T10:01:00.000Z" };
  const fired = evaluateResearch(first, assetKey, next);
  assert.equal(fired.alerts.length, 2);
  assert.ok(fired.alerts.some((alert) => alert.evidenceUrl.includes("dexscreener.com")));
  assert.equal(evaluateResearch(fired, assetKey, next).alerts.length, 2);
  const outage = evaluateResearch(fired, assetKey, { ...next, source: "error", liquidityUsd: null, eventsAvailable: false, eventIds: [], checkedAt: "2026-09-28T10:02:00.000Z" });
  assert.equal(outage.alerts.length, 3);
  assert.equal(outage.alerts.filter((alert) => alert.ruleId === "liquidity").length, 1);
  assert.deepEqual(readResearchState(JSON.stringify(outage)).watchlist, []);
});
