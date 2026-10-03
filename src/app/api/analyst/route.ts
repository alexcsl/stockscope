import { analystConfig, explainEvidence } from "@/lib/analyst";
import { getSourcedAsset } from "@/lib/robinhood-data";
import { readEvidence } from "@/lib/evidence-store";
import { record } from "@/lib/observations";
import { guardRequest, readSmallBody } from "@/lib/request-guard";

async function handlePOST(request: Request) {
  const denied = await guardRequest(request, "analyst", 5);
  if (denied) return denied;
  const input = record(await readSmallBody(request).catch(() => null));
  if (!input || !["AAPL", "NVDA", "TSLA"].includes(String(input.symbol)) || Object.keys(input).some((key) => !["symbol", "evidenceHash"].includes(key))) return Response.json({ error: "Invalid analyst request" }, { status: 400 });
  const stored = typeof input.evidenceHash === "string" && /^0x[\da-f]{64}$/i.test(input.evidenceHash) ? await readEvidence(input.evidenceHash) : null;
  if (input.evidenceHash && (!stored || stored.evidence.symbol !== input.symbol)) return Response.json({ error: "Evidence not found for this asset" }, { status: 404 });
  const asset = stored?.evidence.asset || await getSourcedAsset(String(input.symbol));
  const result = await explainEvidence(stored ? { evidence: stored.evidence, decision: stored.decision } : asset, [
    { id: 1, label: "Issuer identity", url: asset.identity.source.url },
    { id: 2, label: "Issuer reference", url: asset.price.source.url },
    { id: 3, label: "Corporate actions", url: asset.events.source.url },
    { id: 4, label: "Chain evidence", url: asset.chain.source.url },
  ], analystConfig());
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
import { privateRoute } from "@/lib/account-access";
export const POST = privateRoute(handlePOST, true);
