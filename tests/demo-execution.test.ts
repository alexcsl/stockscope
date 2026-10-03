import assert from "node:assert/strict";
import test from "node:test";
import { readDemoStatus } from "../src/lib/demo-status";
import { validTestnetManifest, type TestnetManifest } from "../src/lib/testnet-execution";
import { eligibleEvidence } from "./source-fixtures";
import { hashEvidence } from "../src/lib/policy";

const binding = { address: `0x${"1".repeat(40)}` as const, codeHash: `0x${"2".repeat(64)}` as const, sourceUrl: "https://sepolia.arbiscan.io/address/demo" };
const manifest: TestnetManifest = { chainId: 421614, demo: { controller: binding }, executor: binding, stablecoin: binding, sequencer: binding, assets: [{ symbol: "AAPL", assetKey: `robinhood:4663:${binding.address}`, token: binding, protocol: 3, adapter: binding, venue: binding, factory: binding, quoter: binding, poolId: `0x${"3".repeat(64)}`, fee: 3000, tickSpacing: 0, oracles: [{ token: binding.address, feed: binding, maxAge: 3600 }, { token: binding.address, feed: binding, maxAge: 3600 }] }] };

test("demo manifests require a bound controller on Arbitrum Sepolia", () => {
  assert.equal(validTestnetManifest(manifest), true);
  assert.equal(validTestnetManifest({ ...manifest, chainId: 46630 }), false);
  assert.equal(validTestnetManifest({ ...manifest, demo: {} }), false);
  assert.equal(validTestnetManifest({ ...manifest, demo: { controller: { ...binding, codeHash: "0x" } } }), false);
});
test("demo status preserves unavailable and unconfigured states", async () => {
  assert.equal((await readDemoStatus(null)).state, "unconfigured");
  assert.equal((await readDemoStatus({ ...manifest, chainId: 46630 })).state, "unavailable");
});
test("demo attribution is part of the signed evidence hash", () => {
  const evidence = eligibleEvidence();
  evidence.testnet = { chainId: 421614, user: binding.address, executor: binding.address, executorCodeHash: binding.codeHash, stockToken: binding.address, stablecoin: binding.address, assetKey: manifest.assets[0].assetKey, sourceUrls: [], checks: [] };
  const unlabelled = hashEvidence(evidence);
  evidence.testnet.demo = { controller: binding.address };
  assert.notEqual(hashEvidence(evidence), unlabelled);
});
