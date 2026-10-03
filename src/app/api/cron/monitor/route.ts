import { timingSafeEqual } from "node:crypto";
import { database, hostedConfigured } from "@/lib/hosted-store";
import { withAccountId } from "@/lib/account-context";
import { runMonitor } from "@/lib/monitor";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const value = request.headers.get("authorization") || "";
  if (!expected || Buffer.byteLength(value) !== Buffer.byteLength(`Bearer ${expected}`) || !timingSafeEqual(Buffer.from(value), Buffer.from(`Bearer ${expected}`))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hostedConfigured()) return Response.json({ state: "not_configured" }, { status: 503 });
  try {
    const sql = database();
    const owners = await sql`select owner from stockscope.state where name = 'monitor' and jsonb_array_length(value->'rules') > 0 order by owner limit 100`;
    let completed = 0;
    let failed = 0;
    for (let offset = 0; offset < owners.length; offset += 4) {
      const results = await Promise.allSettled(owners.slice(offset, offset + 4).map(({ owner }) => withAccountId(owner, () => runMonitor())));
      completed += results.filter((result) => result.status === "fulfilled").length;
      failed += results.filter((result) => result.status === "rejected").length;
    }
    return Response.json({ completed, failed, delivery: "in_app", schedule: "daily", limited: owners.length === 100 }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ state: "unavailable" }, { status: 503 }); }
}
