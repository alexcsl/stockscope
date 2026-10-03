import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy, hashEvidence } from "../src/lib/policy";
import { eligibleEvidence } from "./source-fixtures";

test("policy replay reproduces the decision and canonical evidence hash", () => {
  const evidence = eligibleEvidence();
  assert.equal(evaluatePolicy(evidence).status, "eligible");
  assert.deepEqual(evaluatePolicy(evidence), evaluatePolicy(structuredClone(evidence)));
  assert.equal(hashEvidence({ b: 2, a: 1 }), hashEvidence({ a: 1, b: 2 }));
});
test("stale quotes, wrong input, wrong contract, and excessive oracle value block", () => {
  for (const change of ["expired", "amount", "contract", "limit"] as const) {
    const evidence = eligibleEvidence();
    if (change === "expired") evidence.evaluatedAt = "2026-09-26T02:00:16Z";
    if (change === "amount") evidence.inputAmount = "1";
    if (change === "contract") evidence.quote.tokenAddress = `0x${"3".repeat(40)}`;
    if (change === "limit") evidence.inputUsd18 = "10000000000000000001";
    assert.equal(evaluatePolicy(evidence).status, "blocked");
  }
});
test("missing deployment, simulation, hook-free pool or events never passes", () => {
  for (const change of ["deployment", "simulation", "pool", "events"] as const) {
    const evidence = eligibleEvidence();
    if (change === "deployment") evidence.deploymentVerified = false;
    if (change === "simulation") evidence.simulated = false;
    if (change === "pool") evidence.quote.pool = undefined;
    if (change === "events") evidence.asset.events = { state: "error", reason: "missing", source: evidence.asset.events.source };
    assert.notEqual(evaluatePolicy(evidence).status, "eligible");
  }
});
