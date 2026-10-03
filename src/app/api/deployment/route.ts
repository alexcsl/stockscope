import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { executionChainAllowed } from "@/lib/execution-network";
import { operatorRequest } from "@/lib/operator-access";

export async function GET(request: Request) {
  if (process.env.VERCEL === "1" || process.env.ENABLE_LOCAL_DEPLOYMENT_UI !== "true") return Response.json({ state: "disabled", message: "Local deployment controls are disabled." }, { status: 403 });
  const denied = operatorRequest(request);
  if (denied) return denied;
  try {
    const requests = JSON.parse(await readFile(join(process.cwd(), ".stockscope", "deployment-requests.json"), "utf8"));
    if (!Array.isArray(requests) || requests.some((item) => !executionChainAllowed(Number(item.chainId)))) return Response.json({ state: "disabled", message: "Only testnet deployment requests are allowed." }, { status: 409 });
    return Response.json({ state: "available", requests }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ state: "unavailable", message: "Prepare verified unsigned deployment requests first." }, { status: 404 }); }
}
