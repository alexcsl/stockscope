import { discoverXStocks } from "@/lib/xstocks-catalog";
export async function GET() {
  return Response.json(await discoverXStocks(), { headers: { "Cache-Control": "private, max-age=60" } });
}
