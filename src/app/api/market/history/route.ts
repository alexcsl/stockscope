import { candleHistory, type CandleInterval } from "@/lib/candle-history";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("issuer") === "xstocks") {
    const symbol = params.get("symbol") || "";
    const interval = params.get("interval") || "";
    const contract = params.get("contract") || undefined;
    const pool = params.get("pool") || undefined;
    if (!/^[A-Za-z0-9]{1,15}x$/.test(symbol) || params.get("chainId") !== "42161" || !["15m", "1h", "1d"].includes(interval) || (contract && !/^0x[\da-f]{40}$/i.test(contract)) || (pool && !/^0x[\da-f]{64}$/i.test(pool))) return Response.json({ error: "Unsupported exact instrument or interval" }, { status: 400 });
    return Response.json(await candleHistory(symbol, interval as CandleInterval, { contract, pool }), { headers: { "Cache-Control": "no-store" } });
  }
  const symbol = params.get("symbol")?.toUpperCase();
  const interval = params.get("interval");
  const contract = params.get("contract") || undefined;
  const pool = params.get("pool") || undefined;
  if ((params.has("issuer") && params.get("issuer") !== "robinhood") || (params.has("chainId") && params.get("chainId") !== "4663") || !symbol || !["AAPL", "NVDA", "TSLA"].includes(symbol) || !interval || !["15m", "1h", "1d", "h1", "h24"].includes(interval) || (contract && !/^0x[\da-f]{40}$/i.test(contract)) || (pool && !/^0x[\da-f]{40}$/i.test(pool))) return Response.json({ error: "Unsupported asset or interval" }, { status: 400 });
  const frame = interval === "h1" ? "1h" : interval === "h24" ? "1d" : interval as CandleInterval;
  return Response.json(await candleHistory(symbol, frame, { issuer: "robinhood", contract, pool }), { headers: { "Cache-Control": "no-store" } });
}
