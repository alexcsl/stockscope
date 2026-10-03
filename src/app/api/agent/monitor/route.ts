import { readMonitor, removeAlert, removeRule, runMonitor, saveRules, type MonitoredRule } from "@/lib/monitor";
import { readSmallBody } from "@/lib/request-guard";

export const runtime = "nodejs";

async function handleGET() {
  return Response.json(await readMonitor(), { headers: { "Cache-Control": "no-store" } });
}

async function handlePOST(request: Request) {
  const input = await readSmallBody(request, 32768).catch(() => null) as { action?: string; rules?: MonitoredRule[] } | null;
  if (input?.action === "run") return Response.json(await runMonitor(), { headers: { "Cache-Control": "no-store" } });
  if (input?.action !== "import" || !Array.isArray(input.rules)) return Response.json({ error: "Invalid monitor request" }, { status: 400 });
  try { return Response.json(await saveRules(input.rules), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "invalid_rules" }, { status: 400 }); }
}

async function handleDELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !/^[\da-f-]{8,64}$/i.test(id)) return Response.json({ error: "Invalid rule" }, { status: 400 });
  if (url.searchParams.get("kind") === "alert") await removeAlert(id);
  else await removeRule(id);
  return Response.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
}
import { privateRoute } from "@/lib/account-access";
export const GET = privateRoute(handleGET);
export const POST = privateRoute(handlePOST);
export const DELETE = privateRoute(handleDELETE);
