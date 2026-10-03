import { test } from "node:test";
import assert from "node:assert/strict";
import { BaseError } from "viem";
import { candleSourceError, parseCandles, parseCandlePayload, poolKeyHash } from "../src/lib/candle-history";
import { cachedSource } from "../src/lib/source-cache";
import { discoverXStocks } from "../src/lib/xstocks-catalog";

test("chart failures keep RPC URLs and request internals out of public messages", () => {
  const timeout = new BaseError("The request timed out.", { details: "URL: https://rpc.example/private-key Request body: eth_getCode" });
  assert.equal(candleSourceError(timeout), "Arbitrum verification timed out. Retry after one minute.");
  assert.equal(candleSourceError(new BaseError("Request failed", { details: "private-key" })), "Arbitrum verification source is unavailable. Retry after one minute.");
  assert.equal(candleSourceError(new Error("Candle token identity mismatch.")), "Candle token identity mismatch.");
  assert.equal(candleSourceError(new Error("URL: https://rpc.example/private-key")), "Chart source is unavailable. Retry after one minute.");
});

test("candles retain sparse intervals and reject impossible units or duplicate observations", () => {
  const rows = [[10800, 4, 6, 3, 5, 20], [3600, 2, 4, 1, 3, 10]];
  const parsed = parseCandles(rows, "1h", 20000000);
  assert.equal(parsed.gaps, 1);
  assert.equal(parsed.candles[0].close, 3);
  assert.equal(parsed.candles.length, 2);
  for (const bad of [[[3600, 2, 1, 1, 3, 10]], [[3601, 2, 4, 1, 3, 10]], [[3600, 2, 4, 1, 3, -1]], [...rows, rows[0]]]) assert.throws(() => parseCandles(bad, "1h", 20000000));
  assert.throws(() => parseCandles(rows, "1h", 1000));
  assert.deepEqual(parseCandles([], "1h"), { candles: [], gaps: 0 });
});

test("V4 pool identity binds currencies, fee, tick spacing and hook", () => {
  const zero = `0x${"0".repeat(40)}`;
  const a = `0x${"1".repeat(40)}`, b = `0x${"2".repeat(40)}`;
  const id = poolKeyHash(a, b, 500, 10, zero);
  assert.notEqual(id, poolKeyHash(b, a, 500, 10, zero));
  assert.notEqual(id, poolKeyHash(a, b, 3000, 10, zero));
  assert.notEqual(id, poolKeyHash(a, b, 500, 60, zero));
  assert.notEqual(id, poolKeyHash(a, b, 500, 10, a));
});

test("history rejects wrong token, wrong quote scope, and absent indexed history", () => {
  const contract = `0x${"1".repeat(40)}`;
  const meta = { base: { address: contract }, quote: { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" } };
  const payload = { meta, data: { attributes: { ohlcv_list: [[3600, 2, 4, 1, 3, 10]] } } };
  assert.equal(parseCandlePayload(payload, contract, "1h", 20000000).candles.length, 1);
  assert.throws(() => parseCandlePayload(payload, `0x${"2".repeat(40)}`, "1h", 20000000), /token identity/);
  assert.throws(() => parseCandlePayload({ ...payload, meta: { ...meta, quote: { address: contract } } }, contract, "1h", 20000000), /quote identity/);
  assert.throws(() => parseCandlePayload({ meta, data: { attributes: { ohlcv_list: [] } } }, contract, "1h"), /No indexed trades/);
});

test("source cache coalesces pending loads past TTL, expires completed results and retries failures", async () => {
  const fetcher = (async () => new Response()) as typeof fetch;
  let finish!: (value: number) => void;
  let calls = 0;
  const load = () => { calls++; return new Promise<number>((resolve) => { finish = resolve; }); };
  const first = cachedSource("pending", 0, load, fetcher);
  await Promise.resolve();
  const second = cachedSource("pending", 0, load, fetcher);
  assert.equal(first, second);
  finish(9);
  assert.equal(await first, 9);
  assert.equal(await cachedSource("pending", 0, async () => 10, fetcher), 10);
  await assert.rejects(cachedSource("retry", 300, async () => { throw new Error("outage"); }, fetcher));
  assert.equal(await cachedSource("retry", 300, async () => 1, fetcher), 1);
  assert.equal(calls, 1);
});

test("catalog discovers later pages and marks interrupted discovery as partial", async () => {
  const listing = (symbol: string) => ({ symbol, name: symbol, underlyingSymbol: symbol.slice(0, -1), trading: { currency: "USD" }, deployments: [{ network: "Arbitrum", address: `0x${"1".repeat(40)}` }] });
  const fetcher = (async (url: string | URL | Request) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return Response.json({ nodes: [listing(page ? "LATERx" : "FIRSTx")], page: { currentPage: page, hasNextPage: page === 0 } });
  }) as typeof fetch;
  const snapshot = await discoverXStocks(fetcher);
  assert.equal(snapshot.complete, true);
  assert.deepEqual(snapshot.assets.map((item) => item.symbol), ["FIRSTx", "LATERx"]);
  const failing = (async (url: string | URL | Request) => new URL(String(url)).searchParams.get("page") === "0" ? fetcher(url) : new Response("", { status: 503 })) as typeof fetch;
  const partial = await discoverXStocks(failing);
  assert.equal(partial.complete, false);
  assert.equal(partial.assets.length, 1);
  assert.match(partial.reason!, /could not load/);
});

test("discovery stops after 2,000 provider records and reports its coverage bound", async () => {
  let pages = 0;
  const fetcher = (async (url: string | URL | Request) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    pages++;
    return Response.json({ page: { currentPage: page, hasNextPage: true }, nodes: Array.from({ length: 100 }, (_, index) => ({ symbol: `TOKEN${page * 100 + index}x`, name: "Token", underlyingSymbol: "TOKEN", trading: { currency: "USD" }, deployments: [{ network: "Arbitrum", address: `0x${"1".repeat(40)}` }] })) });
  }) as typeof fetch;
  const catalog = await discoverXStocks(fetcher);
  assert.equal(pages, 20);
  assert.equal(catalog.assets.length, 2000);
  assert.equal(catalog.complete, false);
  assert.match(catalog.reason!, /2,000/);
});
