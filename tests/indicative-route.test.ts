import assert from "node:assert/strict";
import test from "node:test";
import { getIndicativeRoute, parsePrice } from "../src/lib/indicative-route";

const token = "0xc845b2894dbddd03858fd2d643b4ef725fe0849d";
const usdc = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

function price(overrides: Record<string, unknown> = {}) {
  return {
    liquidityAvailable: true,
    buyToken: token,
    sellToken: usdc,
    buyAmount: "1000000000000000000",
    sellAmount: "1000000000",
    route: { fills: [{ source: "Uniswap_V3" }] },
    ...overrides,
  };
}

function mockFetch(routeResponse = Response.json(price())): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.xstocks.fi") && !url.includes("price-data") && !url.includes("multiplier")) {
      return Response.json({
        name: "NVIDIA xStock", symbol: "NVDAx", underlyingSymbol: "NVDA", isin: "CH0000000000", trading: { currency: "USD" },
        deployments: [{ network: "Arbitrum", address: token, stablecoins: [{ network: "Arbitrum", symbol: "USDC", currency: "USD", address: usdc, decimals: 6 }] }],
      });
    }
    if (url.includes("api.xstocks.fi")) return Response.json({ quote: 100, currentMultiplier: 1 });
    if (url.includes("arb1.arbitrum.io")) {
      const request = JSON.parse(String(init?.body));
      if (request.method === "eth_getCode") return Response.json({ result: "0x6080" });
      return Response.json({ result: request.params[0].to.toLowerCase() === usdc ? "0x06" : "0x12" });
    }
    if (url.includes("api.0x.org")) {
      const query = new URL(url).searchParams;
      assert.equal(query.get("sellAmount"), "1000000000");
      assert.equal(query.get("chainId"), "42161");
      assert.equal(new Headers(init?.headers).get("0x-api-key"), "test-key");
      return routeResponse;
    }
    throw new Error(`Unexpected source: ${url}`);
  }) as typeof fetch;
}

test("rejects a route with the wrong asset or malformed amount", () => {
  assert.equal(parsePrice(price({ buyToken: usdc }), token, usdc).state, "invalid_response");
  assert.equal(parsePrice(price({ buyAmount: "0" }), token, usdc).state, "invalid_response");
  assert.equal(parsePrice(price({ liquidityAvailable: false }), token, usdc).state, "no_route");
});

test("does not call any source without a key", async () => {
  const result = await getIndicativeRoute(1000, undefined, (() => { throw new Error("Called source"); }) as typeof fetch);
  assert.equal(result.state, "not_configured");
});

test("accepts a checked indicative route with exact input units", async () => {
  const result = await getIndicativeRoute(1000, "test-key", mockFetch());
  assert.equal(result.state, "available");
  assert.equal(result.buyAmount, "1000000000000000000");
  assert.deepEqual(result.sources, ["Uniswap_V3"]);
});

test("rejects a changed sell amount and reports no liquidity", async () => {
  const changed = await getIndicativeRoute(1000, "test-key", mockFetch(Response.json(price({ sellAmount: "900000000" }))));
  assert.equal(changed.state, "invalid_response");
  const absent = await getIndicativeRoute(1000, "test-key", mockFetch(Response.json({ liquidityAvailable: false })));
  assert.equal(absent.state, "no_route");
});

test("identifies xStocks opt-in denial without exposing provider text", async () => {
  const denied = await getIndicativeRoute(1000, "test-key", mockFetch(Response.json({ message: "Trading xStock tokens requires explicit opt-in agreement" }, { status: 403 })));
  assert.equal(denied.state, "rwa_access_required");
  assert.equal(JSON.stringify(denied).includes("explicit opt-in agreement"), false);
});
