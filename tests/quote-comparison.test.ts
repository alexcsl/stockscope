import { test } from "node:test";
import assert from "node:assert/strict";
import { impliedUsdgPerToken, quoteExpired } from "../src/lib/quote-comparison";
import type { UniswapRoute } from "../src/lib/uniswap-route";

const quote: UniswapRoute = { state: "available", checkedAt: "2026-09-28T00:00:00Z", expiresAt: "2026-09-28T00:00:15Z", sizeUsd: 1, symbol: "AAPL", inputAmount: "1000000", outputAmount: "25000000000000000", routing: "CLASSIC" };

test("quote comparison retains exact base units and expires independently", () => {
  assert.equal(impliedUsdgPerToken(quote), "40");
  assert.equal(quoteExpired(quote, Date.parse("2026-09-28T00:00:14Z")), false);
  assert.equal(quoteExpired(quote, Date.parse("2026-09-28T00:00:15Z")), true);
  assert.equal(impliedUsdgPerToken({ ...quote, outputAmount: "0" }), null);
  assert.equal(impliedUsdgPerToken({ ...quote, state: "no_route" }), null);
});
