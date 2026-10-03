import { buildProposal } from "@/lib/agent-workflows";
import { readAgentState, saveProposal } from "@/lib/agent-store";
import { readSmallBody } from "@/lib/request-guard";

export const runtime = "nodejs";

async function handlePOST(request: Request) {
  const input = await readSmallBody(request).catch(() => null) as { assetKey?: string; reportId?: string; direction?: "buy" | "sell"; amount?: string } | null;
  if (!input || typeof input.assetKey !== "string" || typeof input.reportId !== "string" || !["buy", "sell"].includes(input.direction || "") || typeof input.amount !== "string") return Response.json({ error: "Invalid proposal request" }, { status: 400 });
  const report = (await readAgentState(input.assetKey)).reports.find((item) => item.id === input.reportId);
  if (!report || report.kind === "unsupported") return Response.json({ error: "Cited report required" }, { status: 409 });
  const proposal = buildProposal(report, input.direction!, input.amount);
  if (!proposal) return Response.json({ error: "Invalid amount" }, { status: 400 });
  await saveProposal(proposal);
  return Response.json(proposal, { headers: { "Cache-Control": "no-store" } });
}
import { privateRoute } from "@/lib/account-access";
export const POST = privateRoute(handlePOST);
