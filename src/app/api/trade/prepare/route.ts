import { address, record } from "@/lib/observations";
import { prepareTrade } from "@/lib/execution";
import { guardRequest, readSmallBody } from "@/lib/request-guard";
import { readAgentState } from "@/lib/agent-store";
import { proposalMatches } from "@/lib/agent-workflows";
import { getSourcedAsset } from "@/lib/robinhood-data";
import { instrumentKey } from "@/lib/research-state";

async function handlePOST(request: Request) {
  const denied = await guardRequest(request, "trades", 10);
  if (denied) return denied;
  const input = record(await readSmallBody(request).catch(() => null));
  if (!input || !["AAPL", "NVDA", "TSLA"].includes(String(input.symbol)) || !["buy", "sell"].includes(String(input.direction)) || !address(input.user) || typeof input.inputAmount !== "string" || !/^[1-9]\d{0,29}$/.test(input.inputAmount) || input.proposalId !== undefined && (typeof input.proposalId !== "string" || !/^0x[\da-f]{64}$/i.test(input.proposalId)) || Object.keys(input).some((key) => !["symbol", "direction", "inputAmount", "user", "proposalId"].includes(key))) return Response.json({ error: "Invalid trade input" }, { status: 400 });
  if (input.proposalId) {
    const asset = await getSourcedAsset(String(input.symbol));
    if (asset.identity.state !== "available" || asset.chain.state !== "available") return Response.json({ error: "Exact token identity unavailable" }, { status: 409 });
    const assetKey = instrumentKey("robinhood", 4663, asset.identity.value.contract);
    const proposal = (await readAgentState(assetKey)).proposals.find((item) => item.id === input.proposalId);
    if (!proposal || !proposalMatches(proposal, assetKey, String(input.symbol), input.direction as "buy" | "sell", input.inputAmount)) return Response.json({ error: "Proposal expired or changed. Create and review a fresh draft." }, { status: 409 });
  }
  return Response.json(await prepareTrade(String(input.symbol), input.direction as "buy" | "sell", input.inputAmount, input.user), { headers: { "Cache-Control": "no-store" } });
}
import { privateRoute } from "@/lib/account-access";
export const POST = privateRoute(handlePOST, true);
