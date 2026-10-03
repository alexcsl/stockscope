import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIndexedPairs, parseVenuePairs } from "../src/lib/venue-market";
import { parseCandlePayload } from "../src/lib/candle-history";
import { indexedJson } from "../src/lib/indexed-provider";
import { GET as history } from "../src/app/api/market/history/route";
import { GET as venues } from "../src/app/api/market/venues/route";

const token = `0x${"1".repeat(40)}`;
const quote = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const pool = `0x${"2".repeat(40)}`;
const retrievedAt = "2026-10-03T01:00:00.000Z";
const pair = {
  attributes: { address: pool, name: "AAPL / USDG 0.05%", base_token_price_usd: "333.125", reserve_in_usd: "0", pool_created_at: "2026-07-27T16:51:58Z", price_change_percentage: { m5: "0", h1: "-0.3", h24: "2.1" }, volume_usd: { m5: "0", h1: "18", h24: "100" }, transactions: { m5: { buys: 0, sells: 0, buyers: 0, sellers: 0 }, h24: { buys: 4, sells: 2, buyers: 3, sellers: 1 } } },
  relationships: { dex: { data: { id: "uniswap-v3-robinhood" } }, base_token: { data: { id: `robinhood_${token}` } }, quote_token: { data: { id: `robinhood_${quote}` } } },
};

test("indexed activity preserves zero, signed changes, unique wallets and exact pool scope", () => {
  const parsed = parseIndexedPairs({ data: [pair] }, 4663, token, quote, retrievedAt)[0];
  assert.equal(parsed.priceUsd, "333.125");
  assert.equal(parsed.liquidityUsd, "0");
  assert.equal(parsed.windows.find((row) => row.window === "m5")?.volumeUsd, "0");
  assert.equal(parsed.windows[0].changePercent, -0.3);
  assert.equal(parsed.windows[1].buys, 4);
  assert.equal(parsed.windows[1].buyers, 3);
  for (const [chainId, contract, quoteContract] of [[42161, token, quote], [4663, quote, token], [4663, token, token]] as const) assert.deepEqual(parseIndexedPairs({ data: [pair] }, chainId, contract, quoteContract, retrievedAt), []);
  assert.deepEqual(parseIndexedPairs({ data: [{ ...pair, attributes: { ...pair.attributes, address: "invalid" } }] }, 4663, token, quote, retrievedAt), []);
});

test("malformed prices and activity remain missing rather than becoming zero", () => {
  const attrs = { ...pair.attributes, base_token_price_usd: " ", reserve_in_usd: "-1", price_change_percentage: { h24: "Infinity" }, volume_usd: { h24: "NaN" }, transactions: { h24: { buys: -1, sells: 0.5 } } };
  const parsed = parseIndexedPairs({ data: [{ ...pair, attributes: attrs }] }, 4663, token, quote, retrievedAt)[0];
  assert.equal(parsed.priceUsd, null);
  assert.equal(parsed.liquidityUsd, null);
  assert.equal(parsed.windows[1].changePercent, null);
  assert.equal(parsed.windows[1].volumeUsd, null);
  assert.equal(parsed.windows[1].buys, null);
  assert.equal(parsed.windows[1].sells, null);
});

test("V4 metrics are admitted only by callers that separately verify initialization", () => {
  const v4 = { ...pair, attributes: { ...pair.attributes, address: `0x${"3".repeat(64)}` }, relationships: { ...pair.relationships, dex: { data: { id: "uniswap-v4-robinhood" } } } };
  assert.deepEqual(parseIndexedPairs({ data: [v4] }, 4663, token, quote, retrievedAt), []);
  assert.equal(parseIndexedPairs({ data: v4 }, 4663, token, quote, retrievedAt, true)[0].dex, "Uniswap V4");
});

test("DEX Screener prices and window changes are retained without changing quote identity", () => {
  const row = { chainId: "robinhood", dexId: "uniswap", labels: ["v3"], pairAddress: pool, baseToken: { address: token }, quoteToken: { address: quote }, priceUsd: "250.50", priceChange: { h1: -3, h24: 0 }, txns: { h24: { buys: 0, sells: 0 } }, volume: { h24: 0 } };
  const parsed = parseVenuePairs([row], 4663, token, quote, retrievedAt)[0];
  assert.equal(parsed.priceUsd, "250.5");
  assert.equal(parsed.windows[0].changePercent, -3);
  assert.equal(parsed.windows[1].volumeUsd, "0");
});

test("Robinhood candle prices bind USDG instead of accepting another stablecoin", () => {
  const payload = { meta: { base: { address: token }, quote: { address: quote } }, data: { attributes: { ohlcv_list: [[3600, 2, 4, 1, 3, 0]] } } };
  assert.equal(parseCandlePayload(payload, token, "1h", 20000000, quote).candles[0].volume, 0);
  assert.throws(() => parseCandlePayload(payload, token, "1h", 20000000), /quote identity/);
});

test("indexed source snapshots coalesce concurrent chart and activity requests and retry failures", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return Response.json({ data: [pair] }); }) as typeof fetch;
  const [one, two] = await Promise.all([indexedJson("/test", fetcher), indexedJson("/test", fetcher)]);
  assert.equal(calls, 1);
  assert.equal(one, two);
  const failing = (async () => new Response("", { status: 429 })) as typeof fetch;
  await assert.rejects(indexedJson("/test", failing), /rate limit/);
});

test("market endpoints reject mixed issuer chains and malformed exact instruments before contacting providers", async () => {
  for (const query of ["issuer=robinhood&chainId=42161&symbol=AAPL&interval=1h", "issuer=xstocks&chainId=4663&symbol=AAPLx&interval=1h", "issuer=other&symbol=AAPL&interval=1h", "issuer=robinhood&symbol=AAPL&interval=1h&pool=invalid"]) assert.equal((await history(new Request(`http://localhost/api/market/history?${query}`))).status, 400);
  for (const query of ["issuer=xstocks&chainId=4663&symbol=AAPLx", "issuer=other&symbol=AAPL"]) assert.equal((await venues(new Request(`http://localhost/api/market/venues?${query}`))).status, 400);
});
