import { getXStock, listXStocks } from "@/lib/xstocks-catalog";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol");
  if (symbol) {
    const record = await getXStock(symbol);
    return Response.json(record || { state: "unavailable", reason: "issuer_or_identity_unavailable" }, { headers: { "Cache-Control": "no-store" } });
  }
  const page = Number(params.get("page") || "0");
  if (!Number.isInteger(page) || page < 0 || page > 1000) return Response.json({ error: "Unsupported page" }, { status: 400 });
  return Response.json(await listXStocks(page), { headers: { "Cache-Control": "no-store" } });
}
