import { explainEvidence, type AnalystConfig } from "./analyst";
import { buildProposal, type ActionProposal, type AgentReport } from "./agent-workflows";
import { hashEvidence } from "./policy";

export function explicitIntent(request: string, symbol: string): { direction: "buy" | "sell"; amount: string } | null {
  if (!/^(AAPL|NVDA|TSLA)$/.test(symbol) || request.length > 200) return null;
  const text = request.trim().replace(/^(please\s+)?(draft\s+(a\s+)?(plan\s+to\s+)?)?/i, "").replace(/[.!]$/, "");
  const amount = "((?:0|[1-9]\\d*)(?:\\.\\d+)?)";
  const buy = text.match(new RegExp(`^(?:buy ${symbol} (?:with|using|for) ${amount} USDG|spend ${amount} USDG on ${symbol})$`, "i"));
  if (buy) return { direction: "buy", amount: buy[1] || buy[2] };
  const sell = text.match(new RegExp(`^sell ${amount} ${symbol}(?: for USDG)?$`, "i"));
  return sell ? { direction: "sell", amount: sell[1] } : null;
}

type PlanResult = { state: "available"; proposal: ActionProposal } | { state: string; message: string };

export async function draftTrade(report: AgentReport, request: string, config: AnalystConfig, fetcher: typeof fetch = fetch): Promise<PlanResult> {
  const now = config.now?.() || new Date();
  const age = now.getTime() - Date.parse(report.generatedAt);
  if (report.kind === "unsupported" || !Number.isFinite(age) || age < 0 || age > 300000) return { state: "report_expired", message: "Create a fresh cited briefing before asking for a trade draft." };
  const intent = explicitIntent(request, report.symbol);
  const proposal = intent && buildProposal(report, intent.direction, intent.amount);
  if (!proposal) return { state: "clarification_required", message: `State one exact input: Buy ${report.symbol} with 5 USDG, or Sell 0.01 ${report.symbol} for USDG. Buys are limited to 10 USDG. Conditional orders, other tokens, and automatic execution are unsupported.` };
  const publicCitations = report.citations.filter((citation) => citation.url.startsWith("https://"));
  const references = publicCitations.map((citation, index) => ({ id: index + 1, label: citation.label, url: citation.url }));
  const claims = report.claims.filter((claim) => claim.citations.every((id) => publicCitations.some((citation) => citation.id === id))).map((claim) => ({ ...claim, citations: claim.citations.map((id) => publicCitations.findIndex((citation) => citation.id === id) + 1) }));
  const verifiedIntent = { assetKey: report.assetKey, symbol: report.symbol, ...intent };
  const result = await explainEvidence({ request, verifiedIntent, claims, unknowns: report.unknowns }, references, { ...config, purpose: "trade_intent" }, fetcher);
  if (result.state !== "available") return result;
  try {
    const value = JSON.parse(result.text) as Record<string, unknown>;
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(",") !== "amount,assetKey,direction,rationale,symbol" || value.assetKey !== report.assetKey || value.symbol !== report.symbol || value.direction !== intent!.direction || value.amount !== intent!.amount || typeof value.rationale !== "string" || value.rationale.length > 1200) throw new Error("invalid_intent");
    const rationaleCitations = [...value.rationale.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
    if (!rationaleCitations.length || rationaleCitations.some((id) => !references.some((source) => source.id === id))) throw new Error("invalid_citations");
    const id = hashEvidence({ proposalId: proposal.id, request, model: result.model, rationale: value.rationale });
    return { state: "available", proposal: { ...proposal, id, generatedAt: now.toISOString(), origin: "ai", request, rationale: value.rationale, model: result.model, usage: result.usage, handoffUrl: `${proposal.handoffUrl.replace("#action", "")}&proposalId=${id}#action` } };
  } catch { return { state: "invalid_response", message: "The model changed the requested trade or returned an invalid draft. No proposal was saved." }; }
}
