import { privateRoute } from "@/lib/account-access";
import { draftTrade } from "@/lib/agent-planner";
import { readAgentState, saveProposal } from "@/lib/agent-store";
import { analystConfig } from "@/lib/analyst";
import { guardRequest, readSmallBody } from "@/lib/request-guard";
import { record } from "@/lib/observations";
import { getSourcedAsset } from "@/lib/robinhood-data";
import { instrumentKey } from "@/lib/research-state";

export const runtime = "nodejs";

async function handlePOST(request: Request) {
  const denied = await guardRequest(request, "agent-plans", 5);
  if (denied) return denied;
  const input = record(await readSmallBody(request).catch(() => null));
  if (!input || typeof input.assetKey !== "string" || !/^robinhood:4663:0x[\da-f]{40}$/i.test(input.assetKey) || typeof input.reportId !== "string" || typeof input.request !== "string" || input.request.length > 200 || Object.keys(input).some((key) => !["assetKey", "reportId", "request"].includes(key))) return Response.json({ error: "Invalid planning request" }, { status: 400 });
  const report = (await readAgentState(input.assetKey)).reports.find((item) => item.id === input.reportId);
  if (!report) return Response.json({ state: "report_required", message: "Create a cited briefing for this exact token first." }, { status: 409 });
  const asset = await getSourcedAsset(report.symbol);
  if (asset.identity.state !== "available" || asset.chain.state !== "available" || instrumentKey("robinhood", 4663, asset.identity.value.contract) !== report.assetKey) return Response.json({ state: "identity_unavailable", message: "Current issuer and onchain identity must agree before drafting." }, { status: 409 });
  const result = await draftTrade(report, input.request, analystConfig());
  if (result.state === "available" && "proposal" in result) await saveProposal(result.proposal);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const POST = privateRoute(handlePOST);
