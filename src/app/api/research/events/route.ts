import { getSourcedAsset, robinhoodSymbols } from "@/lib/robinhood-data";
import { sourceValue } from "@/lib/observations";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol")?.toUpperCase();
  if (!symbol || !(robinhoodSymbols as readonly string[]).includes(symbol)) return Response.json({ error: "Unsupported asset" }, { status: 400 });
  const asset = await getSourcedAsset(symbol);
  return Response.json({ state: asset.events.state, eventIds: sourceValue(asset.events)?.map((event) => `${event.id}:${event.type}:${event.processDate}:${JSON.stringify(event.details)}`) || [], source: asset.events.source }, { headers: { "Cache-Control": "no-store" } });
}
