import { test } from "node:test";
import assert from "node:assert/strict";
import { getSourcedAsset, parseIdentity, parsePrice, parseEvents } from "../src/lib/robinhood-data";
import { assetsResponse, contract, identity, now } from "./source-fixtures";

test("identity requires an exact active deployment and rejects ambiguous records", () => {
  assert.equal(parseIdentity(assetsResponse, "AAPL")?.contract, contract);
  assert.equal(parseIdentity({ assets: [...assetsResponse.assets, ...assetsResponse.assets] }, "AAPL"), null);
  assert.equal(parseIdentity({ assets: [{ ...assetsResponse.assets[0], deployments: [{ chainId: 1, contractAddress: contract }] }] }, "AAPL"), null);
});
const price = { tokenSymbol: "AAPL", bid: "100.000000000000000001", ask: "101", currency: "USD", isTradingHalt: false, generatedAt: now, dailyTradingVolume: "0", deployments: [{ chainId: 4663, contractAddress: contract }] };
test("issuer conversion applies multiplier once without losing precision", () => {
  const observation = parsePrice({ quotes: [price] }, identity, now, Date.parse(now));
  assert.equal(observation.state, "available");
  assert.ok("value" in observation);
  assert.equal(observation.value.tokenBid, "200.000000000000000002");
  assert.equal(observation.value.underlyingVolume, null);
});
test("wrong contract, inverted spread, malformed amount, and missing source time reject the reference", () => {
  for (const change of [{ deployments: [{ chainId: 4663, contractAddress: `0x${"3".repeat(40)}` }] }, { ask: "99" }, { bid: "NaN" }, { generatedAt: null }]) assert.equal(parsePrice({ quotes: [{ ...price, ...change }] }, identity, now).state, "error");
});
test("old or future issuer observation is stale", () => {
  assert.equal(parsePrice({ quotes: [price] }, identity, now, Date.parse(now) + 60001).state, "stale");
  assert.equal(parsePrice({ quotes: [price] }, identity, now, Date.parse(now) - 10000).state, "stale");
});
test("corporate actions are keyed to issuer UID and exact deployment", () => {
  const event = { id: identity.uid, tokenSymbol: "AAPL", type: "FUTURE_EVENT", status: "UNKNOWN", details: { future: {} }, deployments: [{ chainId: 4663, contractAddress: contract }] };
  assert.equal(parseEvents({ corpActions: [event] }, identity)?.[0].status, "UNKNOWN");
  assert.equal(parseEvents({ corpActions: [{ ...event, id: "wrong" }] }, identity), null);
  assert.equal(parseEvents({ corpActions: [{ ...event, processDate: { year: 2026, month: 2, day: 30 } }] }, identity)?.[0].processDate, null);
  assert.deepEqual(parseEvents({ corpActions: [] }, identity), []);
  assert.equal(parseEvents({}, identity), null);
});

test("an issuer outage leaves independent unavailable fields without fixtures", async () => {
  const fetcher = (async () => { throw new Error("offline"); }) as typeof fetch;
  const asset = await getSourcedAsset("AAPL", fetcher);
  assert.equal(asset.identity.state, "error");
  assert.equal(asset.price.state, "unavailable");
  assert.equal(asset.events.state, "unavailable");
  assert.equal(asset.chain.state, "unavailable");
});
