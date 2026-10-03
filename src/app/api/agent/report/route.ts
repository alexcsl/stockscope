import { buildReport, topicForQuestion, withModelAnswer, type AgentReport, type ResearchTopic } from "@/lib/agent-workflows";
import { readAgentState, saveReport } from "@/lib/agent-store";
import { analystConfig, explainEvidence } from "@/lib/analyst";
import { getSourcedAsset, robinhoodSymbols } from "@/lib/robinhood-data";
import { robinhoodVenue } from "@/lib/venue-market";
import { instrumentKey } from "@/lib/research-state";
import { readSmallBody } from "@/lib/request-guard";
import { hashEvidence } from "@/lib/policy";
import { readMonitor } from "@/lib/monitor";
import { readEvidence } from "@/lib/evidence-store";

export const runtime = "nodejs";

async function handleGET(request: Request) {
  const assetKey = new URL(request.url).searchParams.get("assetKey") || "";
  if (!/^robinhood:4663:0x[\da-f]{40}$/i.test(assetKey)) return Response.json({ error: "Invalid asset key" }, { status: 400 });
  return Response.json(await readAgentState(assetKey), { headers: { "Cache-Control": "no-store" } });
}

async function handlePOST(request: Request) {
  const input = await readSmallBody(request).catch(() => null) as { symbol?: string; assetKey?: string; topic?: ResearchTopic; question?: string; evidenceHash?: string } | null;
  if (!input || !input.symbol || !(robinhoodSymbols as readonly string[]).includes(input.symbol) || !/^robinhood:4663:0x[\da-f]{40}$/i.test(input.assetKey || "") || typeof input.question === "string" && input.question.length > 200 || input.evidenceHash && !/^0x[\da-f]{64}$/i.test(input.evidenceHash)) return Response.json({ error: "Invalid report request" }, { status: 400 });
  const asset = await getSourcedAsset(input.symbol);
  if (asset.identity.state !== "available" || asset.chain.state !== "available" || instrumentKey("robinhood", 4663, asset.identity.value.contract) !== input.assetKey) return Response.json({ error: "Exact asset identity unavailable" }, { status: 409 });
  const venue = await robinhoodVenue(asset.identity.value.contract);
  const topic = input.question ? topicForQuestion(input.question) : input.topic === "briefing" || input.topic === "identity" || input.topic === "reference" || input.topic === "venue" || input.topic === "activity" || input.topic === "events" || input.topic === "alerts" || input.topic === "policy" ? input.topic : null;
  const policy = input.evidenceHash ? await readEvidence(input.evidenceHash) : null;
  if (policy && (policy.evidence.symbol !== input.symbol || policy.evidence.asset.identity.state !== "available" || instrumentKey("robinhood", 4663, policy.evidence.asset.identity.value.contract) !== input.assetKey)) return Response.json({ error: "Policy evidence does not match this instrument" }, { status: 409 });
  let report: AgentReport = buildReport(input.assetKey, asset, venue, topic || "briefing", new Date(), policy);
  if (topic === "alerts") {
    const alerts = (await readMonitor()).alerts.filter((item) => item.assetKey === input.assetKey).slice(-5);
    const citationId = report.citations.length + 1;
    report = { ...report, claims: alerts.map((alert) => ({ text: `${alert.kind.replaceAll("_", " ")} notice at ${alert.evaluatedAt}: ${alert.message}`, citations: [citationId] })), citations: [...report.citations, { id: citationId, label: "Local monitor evidence", url: "/api/agent/monitor", state: "available", unit: "Notice", observedAt: alerts.at(-1)?.current.sourceTime || null, retrievedAt: alerts.at(-1)?.evaluatedAt || report.generatedAt }], unknowns: alerts.length ? [] : ["No local monitor notices are stored for this exact instrument."] };
    report.evidenceHash = hashEvidence({ report: report.evidenceHash, alerts: alerts.map((alert) => alert.id) });
    report.id = hashEvidence({ evidenceHash: report.evidenceHash, version: 1 });
  }
  if (!topic) {
    const publicCitations = report.citations.filter((citation) => citation.url.startsWith("https://"));
    const result = await explainEvidence({ assetKey: input.assetKey, question: input.question, claims: report.claims.filter((claim) => claim.citations.every((id) => publicCitations.some((citation) => citation.id === id))), unknowns: report.unknowns, citations: publicCitations }, publicCitations.map(({ id, label, url }) => ({ id, label, url })), analystConfig());
    report = result.state === "available" ? withModelAnswer(report, result) : { ...report, kind: "unsupported", claims: [], unknowns: [`This question is unsupported without a configured, price-verified model. Analyst state: ${result.state}.`] };
    report.id = hashEvidence({ reportId: report.id, question: input.question });
  }
  await saveReport(report);
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
import { privateRoute } from "@/lib/account-access";
export const GET = privateRoute(handleGET);
export const POST = privateRoute(handlePOST);
