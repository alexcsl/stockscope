import { getIdentity } from "@/lib/robinhood-data";
import { robinhoodVenue } from "@/lib/venue-market";
import { xStockVenue } from "@/lib/candle-history";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("issuer") === "xstocks") {
    const symbol = params.get("symbol") || "";
    if (!/^[A-Za-z0-9]{1,15}x$/.test(symbol) || (params.has("chainId") && params.get("chainId") !== "42161")) return Response.json({ error: "Unsupported asset" }, { status: 400 });
    return Response.json(await xStockVenue(symbol), { headers: { "Cache-Control": "no-store" } });
  }
  const symbol = params.get("symbol")?.toUpperCase();
  if ((params.has("issuer") && params.get("issuer") !== "robinhood") || (params.has("chainId") && params.get("chainId") !== "4663")) return Response.json({ error: "Unsupported issuer or chain" }, { status: 400 });
  if (!symbol || !["AAPL", "NVDA", "TSLA"].includes(symbol)) return Response.json({ error: "Unsupported asset" }, { status: 400 });
  const identity = await getIdentity(symbol);
  const result = "value" in identity ? await robinhoodVenue(identity.value.contract) : { state: "unavailable", reason: "identity_unverified", pairs: [], checkedAt: new Date().toISOString() };
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
