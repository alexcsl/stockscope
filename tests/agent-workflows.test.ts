import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProposal, buildReport, topicForQuestion } from "../src/lib/agent-workflows";
import { evaluateObservation, observation, readMonitor, runMonitor, saveRules, validRule, verifiedRule, type MonitoredRule } from "../src/lib/monitor";
import { instrumentKey } from "../src/lib/research-state";
import { operatorRequest } from "../src/lib/operator-access";
import { sourcedAsset, contract, now, eligibleEvidence } from "./source-fixtures";
import { evaluatePolicy } from "../src/lib/policy";
import type { VenueResult } from "../src/lib/venue-market";

const assetKey = instrumentKey("robinhood", 4663, contract);
const venue: VenueResult = { state: "available", checkedAt: now, pairs: [{ chainId: 4663, contract, pairAddress: "0x" + "2".repeat(40), dex: "Uniswap", baseSymbol: "AAPL", quoteSymbol: "USDG", quoteContract: "0x" + "3".repeat(40), createdAt: null, liquidityUsd: "1000", windows: [{ window: "h1", buys: 2, sells: 1, volumeUsd: "20" }, { window: "h24", buys: 10, sells: 4, volumeUsd: "100" }], retrievedAt: now, sourceUrl: "https://dexscreener.com/robinhood/aapl", sourceObservedAt: null }] };
const rule: MonitoredRule = { id: "11111111-1111-4111-8111-111111111111", version: 1, assetKey, symbol: "AAPL", kind: "liquidity_below", threshold: 500, enabled: true };
const snapshot = (liquidityUsd: number | null, source: "available" | "unavailable" | "error" | "stale" = "available", eventIds: string[] = [], sourceTime: string | null = now, checkedAt = now) => observation({ assetKey, symbol: "AAPL", checkedAt, sourceTime, source, liquidityUsd, pairUrl: venue.pairs[0].sourceUrl, eventIds, eventsAvailable: true, reason: source === "available" ? null : source });

test("reports cite every claim and keep missing evidence explicit", () => {
  const report = buildReport(assetKey, sourcedAsset, venue, "briefing");
  assert.ok(report.claims.length > 0);
  assert.ok(report.claims.every((claim) => claim.citations.length && claim.citations.every((id) => report.citations.some((citation) => citation.id === id))));
  assert.match(report.unknowns.join(" "), /observation time/);
  const stale = structuredClone(sourcedAsset);
  stale.price.state = "stale";
  const current = buildReport(assetKey, stale, venue, "reference");
  assert.equal(current.claims.length, 0);
  assert.match(current.unknowns.join(" "), /stale/);
  assert.equal(topicForQuestion("What is the pool liquidity?"), "venue");
  assert.equal(topicForQuestion("What did the policy check say?"), "policy");
  assert.equal(topicForQuestion("Should I invest?"), null);
  const evidence = eligibleEvidence();
  const policy = buildReport(assetKey, sourcedAsset, venue, "policy", new Date("2026-09-29T00:00:00Z"), { evidence, decision: evaluatePolicy(evidence), receipts: [] });
  assert.ok(policy.claims.every((claim) => claim.citations.includes(6)));
  assert.match(policy.unknowns.join(" "), /expired/);
  const proposal = buildProposal(report, "buy", "5");
  assert.equal(proposal?.state, "unsigned");
  assert.match(proposal!.handoffUrl, /direction=buy&amount=5#action/);
  assert.equal(buildProposal(report, "buy", "11"), null);
  assert.equal(buildProposal(report, "buy", "0.1234567"), null);
});

test("monitor uses content IDs and separates market changes from outages", () => {
  const state: Parameters<typeof evaluateObservation>[0] = { rules: [rule, { ...rule, id: "22222222-2222-4222-8222-222222222222", kind: "issuer_event" }, { ...rule, id: "33333333-3333-4333-8333-333333333333", kind: "source_unavailable" }], observations: [], latest: {}, alerts: [], sequences: {} };
  assert.equal(evaluateObservation(state, snapshot(1000)).length, 0);
  assert.equal(snapshot(1000, "available", [], now, "2026-09-26T02:15:00Z").id, snapshot(1000).id);
  assert.equal(evaluateObservation(state, snapshot(null, "error")).length, 1);
  assert.equal(state.alerts[0].kind, "source_health");
  assert.equal(evaluateObservation(state, snapshot(null, "error", [], now, "2026-09-26T02:30:00Z")).length, 0);
  const crossed = evaluateObservation(state, snapshot(400, "available", ["event-1"]));
  assert.deepEqual(crossed.map((item) => item.kind).sort(), ["issuer_event", "liquidity_below"]);
  assert.equal(evaluateObservation(state, snapshot(400, "available", ["event-1"])).length, 0);
  assert.equal(evaluateObservation(state, snapshot(300, "available", ["event-1"], "2026-09-25T02:00:00Z")).length, 0);
  assert.equal(evaluateObservation(state, snapshot(200, "stale", ["event-2"])).length, 0);
  assert.equal(state.latest[assetKey].liquidityUsd, 400);
  assert.equal(evaluateObservation(state, snapshot(1000)).length, 0);
  assert.equal(evaluateObservation(state, snapshot(400)).filter((item) => item.kind === "liquidity_below").length, 1);
  assert.equal(state.alerts.filter((item) => item.kind === "liquidity_below").length, 2);
  assert.equal(evaluateObservation(state, snapshot(null, "unavailable")).filter((item) => item.kind === "source_unavailable").length, 1);
});

test("rules reject wrong chain, units, and exact contract identity", async () => {
  assert.equal(validRule(rule), true);
  assert.equal(validRule({ ...rule, assetKey: instrumentKey("robinhood", 42161, contract) }), false);
  assert.equal(validRule({ ...rule, threshold: -1 }), false);
  const providers = { robinhood: async () => sourcedAsset, xstocks: async () => null };
  assert.equal(await verifiedRule(rule, providers), true);
  assert.equal(await verifiedRule({ ...rule, assetKey: instrumentKey("robinhood", 4663, `0x${"1".repeat(40)}`) }, providers), false);
});

test("local operator mutations require a loopback host and matching origin", () => {
  const previous = process.env.STOCKSCOPE_LOCAL_OPERATOR;
  process.env.STOCKSCOPE_LOCAL_OPERATOR = "1";
  try {
    const request = (host: string, origin: string) => new Request("http://localhost:3102/api/agent/monitor", { method: "POST", headers: { host, origin } });
    assert.equal(operatorRequest(request("127.0.0.1:3102", "http://127.0.0.1:3102"), true), null);
    assert.equal(operatorRequest(request("127.0.0.1:3102", "http://evil.example"), true)?.status, 403);
    assert.equal(operatorRequest(request("evil.example", "http://evil.example"), true)?.status, 403);
  } finally {
    if (previous === undefined) delete process.env.STOCKSCOPE_LOCAL_OPERATOR;
    else process.env.STOCKSCOPE_LOCAL_OPERATOR = previous;
  }
});

test("import and scheduled runs persist and deduplicate across reloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stockscope-monitor-"));
  try {
    assert.deepEqual(await saveRules([rule], directory, async () => true), { imported: 1, total: 1 });
    assert.deepEqual(await saveRules([rule], directory, async () => true), { imported: 0, total: 1 });
    const observations = [snapshot(1000), snapshot(400), snapshot(400)];
    for (const expected of [0, 1, 0]) {
      const result = await runMonitor(directory, async () => observations.shift()!);
      assert.equal(result.alerts, expected);
    }
    const saved = await readMonitor(directory);
    assert.equal(saved.rules.length, 1);
    assert.equal(saved.alerts.length, 1);
    assert.equal(saved.alerts[0].current.liquidityUsd, 400);
    assert.ok(saved.alerts[0].evidenceHash);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
