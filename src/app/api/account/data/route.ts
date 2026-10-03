import { privateRoute } from "@/lib/account-access";
import { accountId } from "@/lib/account-context";
import { database, hostedConfigured } from "@/lib/hosted-store";

export const GET = privateRoute(async () => {
  if (!hostedConfigured()) return Response.json({ error: "Account storage unavailable" }, { status: 503 });
  const records = await database()`select name, value, updated_at from stockscope.state where owner = ${accountId()!} order by name`;
  return Response.json({ exportedAt: new Date().toISOString(), records }, { headers: { "Cache-Control": "no-store", "Content-Disposition": "attachment; filename=stockscope-account.json" } });
});
