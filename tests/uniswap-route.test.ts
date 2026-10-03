import { test } from "node:test";
import assert from "node:assert/strict";
import { getUniswapRoute, readQuote } from "../src/lib/uniswap-route";
import { assetsResponse, contract } from "./source-fixtures";
import { usdgAddress } from "../src/lib/robinhood-data";

function fetcher(status = 200, payload: unknown = { routing: "CLASSIC", quote: { input: { token: usdgAddress, amount: "10000000" }, output: { token: contract, amount: "1000000000000000" } } }): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/assets")) return Response.json(assetsResponse);
    if (String(url).includes("rpc.")) {
      const body = JSON.parse(String(init?.body));
      return Response.json({ result: body.method === "eth_getCode" ? "0x1234" : JSON.stringify(body.params).toLowerCase().includes(usdgAddress.toLowerCase()) ? "0x6" : "0x12" });
    }
    return Response.json(payload, { status });
  }) as typeof fetch;
}
test("quote validates exact amount, contracts, routing, and explicit chain", () => {
  const payload = { routing: "CLASSIC", quote: { input: { token: usdgAddress, amount: "10000000" }, output: { token: contract, amount: "100" } } };
  assert.equal(readQuote(payload, contract, "10000000").state, "available");
  assert.equal(readQuote(payload, contract, "1").state, "invalid_response");
  assert.equal(readQuote({ ...payload, quote: { ...payload.quote, output: { ...payload.quote.output, chainId: 1 } } }, contract, "10000000").state, "invalid_response");
  assert.equal(readQuote({ ...payload, routing: "UNKNOWN" }, contract, "10000000").state, "invalid_response");
});
test("completed quote omits wallet and carries a fifteen-second expiry", async () => {
  let time = 0;
  const result = await getUniswapRoute("AAPL", 10, `0x${"1".repeat(40)}`, "test-key", fetcher(), () => new Date(1000 + time++ * 1000));
  assert.equal(result.state, "available");
  assert.ok(result.expiresAt);
  assert.equal(Date.parse(result.expiresAt) - Date.parse(result.checkedAt), 15000);
  assert.equal("swapper" in result, false);
});

test("sell quote uses token base units and rejects a changed direction or amount", async () => {
  const inputAmount = "10000000000000000";
  const payload = { routing: "CLASSIC", quote: { input: { token: contract, amount: inputAmount }, output: { token: usdgAddress, amount: "1000000" } } };
  let request: Record<string, unknown> = {};
  const base = fetcher(200, payload);
  const selected = ((url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("trade-api.gateway.uniswap.org")) request = JSON.parse(String(init?.body));
    return base(url, init);
  }) as typeof fetch;
  const result = await getUniswapRoute("AAPL", 0, `0x${"1".repeat(40)}`, "key", selected, () => new Date(), { direction: "sell", inputAmount, protocols: ["V3", "V4"] });
  assert.equal(result.state, "available");
  assert.equal(result.direction, "sell");
  assert.equal(result.outputAmount, "1000000");
  assert.equal(request?.tokenIn, contract);
  assert.equal(request?.tokenOut, usdgAddress);
  assert.equal(readQuote(payload, contract, "10000000000000001", "sell").state, "invalid_response");
  assert.equal(readQuote(payload, contract, inputAmount, "buy").state, "invalid_response");
});
test("provider errors stay distinct from liquidity absence", async () => {
  const cases = [[401, {}, "auth_failed"], [403, {}, "access_denied"], [429, {}, "rate_limited"], [404, { errorCode: "NoRouteFoundError" }, "no_route"], [404, { errorCode: "ResourceNotFound" }, "upstream_unavailable"], [404, { errorCode: "QuoteAmountTooLowError" }, "amount_too_low"], [500, {}, "upstream_unavailable"]] as const;
  for (const [status, body, state] of cases) assert.equal((await getUniswapRoute("AAPL", 10, `0x${"1".repeat(40)}`, "key", fetcher(status, body))).state, state);
});
test("wrong decimals or a timeout cannot produce a quote", async () => {
  const broken = (async () => { throw new Error("timeout"); }) as typeof fetch;
  assert.equal((await getUniswapRoute("AAPL", 10, `0x${"1".repeat(40)}`, "key", broken)).state, "identity_unavailable");
  const wrong = (async (url: string | URL | Request) => String(url).endsWith("/assets") ? Response.json(assetsResponse) : Response.json({ result: "0x12" })) as typeof fetch;
  assert.equal((await getUniswapRoute("AAPL", 10, `0x${"1".repeat(40)}`, "key", wrong)).state, "identity_unavailable");
});
