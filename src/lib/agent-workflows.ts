import { hashEvidence } from "./policy";
import type { SourcedAsset } from "./robinhood-data";
import type { VenueResult } from "./venue-market";
import type { AnalystResult } from "./analyst";
import type { EvidenceEntry } from "./evidence-store";

export type ResearchTopic = "briefing" | "identity" | "reference" | "venue" | "activity" | "events" | "alerts" | "policy";
export interface ReportCitation { id: number; label: string; url: string; state: string; unit: string; observedAt: string | null; retrievedAt: string }
export interface ReportClaim { text: string; citations: number[]; category?: ResearchTopic }
export interface AgentReport {
  id: string;
  version: 1;
  kind: ResearchTopic | "model_answer" | "unsupported";
  assetKey: string;
  symbol: string;
  generatedAt: string;
  evidenceHash: string;
  claims: ReportClaim[];
  citations: ReportCitation[];
  unknowns: string[];
  model: string | null;
  promptVersion: number | null;
  usage: { inputTokens: number; outputTokens: number; costUsd: number } | null;
}
export interface ActionProposal {
  id: string;
  version: 1;
  assetKey: string;
  symbol: string;
  direction: "buy" | "sell";
  amount: string;
  inputUnit: string;
  generatedAt: string;
  evidenceHash: string;
  reportId: string;
  handoffUrl: string;
  state: "unsigned";
  origin?: "ai";
  request?: string;
  rationale?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
}

export function topicForQuestion(question: string): ResearchTopic | null {
  const value = question.trim().toLowerCase();
  if (!value || value.length > 200) return null;
  if (/\b(should|recommend|best|invest|predict|profit|execute)\b/.test(value)) return null;
  if (/policy|eligible|readiness|route|simulation/.test(value)) return "policy";
  if (/alert|monitor|watch/.test(value)) return "alerts";
  if (/event|corporate action|split|dividend/.test(value)) return "events";
  if (/volume|trade|buy|sell|activity/.test(value)) return "activity";
  if (/liquidity|pool|pair|venue|market/.test(value)) return "venue";
  if (/bid|ask|reference|price|halt/.test(value)) return "reference";
  if (/identity|contract|chain|issuer|multiplier|isin|token/.test(value)) return "identity";
  return null;
}

export function buildReport(assetKey: string, asset: SourcedAsset, venue: VenueResult, topic: ResearchTopic, now = new Date(), policy: EvidenceEntry | null = null): AgentReport {
  const pair = venue.state === "available" ? venue.pairs[0] : null;
  const citations: ReportCitation[] = [
    { id: 1, label: "Issuer identity", url: asset.identity.source.url, state: asset.identity.state, unit: asset.identity.source.unit, observedAt: asset.identity.source.observedAt, retrievedAt: asset.identity.source.retrievedAt },
    { id: 2, label: "Issuer reference", url: asset.price.source.url, state: asset.price.state, unit: asset.price.source.unit, observedAt: asset.price.source.observedAt, retrievedAt: asset.price.source.retrievedAt },
    { id: 3, label: "Issuer events", url: asset.events.source.url, state: asset.events.state, unit: asset.events.source.unit, observedAt: asset.events.source.observedAt, retrievedAt: asset.events.source.retrievedAt },
    { id: 4, label: "Onchain identity", url: asset.chain.source.url, state: asset.chain.state, unit: asset.chain.source.unit, observedAt: asset.chain.source.observedAt, retrievedAt: asset.chain.source.retrievedAt },
    { id: 5, label: "Verified venue", url: pair?.sourceUrl || "https://docs.dexscreener.com/api/reference", state: venue.state, unit: "USD pool liquidity and named-window activity", observedAt: null, retrievedAt: venue.checkedAt },
  ];
  if (policy) citations.push({ id: 6, label: "Saved deterministic policy evidence", url: `/api/evidence/${policy.decision.evidenceHash}`, state: policy.decision.status, unit: "Policy result for exact input", observedAt: policy.evidence.evaluatedAt, retrievedAt: now.toISOString() });
  const claims: ReportClaim[] = [];
  const unknowns: string[] = [];
  let category: ResearchTopic = topic;
  const include = (section: ResearchTopic) => { category = section; return topic === "briefing" || topic === section; };
  if (include("identity")) {
    if (asset.identity.state === "available" && asset.chain.state === "available") {
      const identity = asset.identity.value;
      claims.push({ category, text: `${identity.name} (${identity.symbol}) is an issuer-listed token on chain ${identity.chainId} at ${identity.contract}.`, citations: [1, 4] });
      claims.push({ category, text: `The current issuer multiplier is ${identity.multiplier}; ${identity.pendingMultiplier ? `a pending multiplier of ${identity.pendingMultiplier} is reported` : "no pending multiplier is reported"}.`, citations: [1, 4] });
    } else unknowns.push("Exact issuer and onchain identity are not jointly verified.");
  }
  if (include("reference")) {
    if (asset.price.state === "available") claims.push({ category, text: `Issuer reference bid and ask are ${asset.price.value.bid} and ${asset.price.value.ask} USD per underlying share. The token-equivalent values are ${asset.price.value.tokenBid} and ${asset.price.value.tokenAsk} USD per token.`, citations: [1, 2] });
    else unknowns.push(`Issuer reference is ${asset.price.state}; no current price claim is available.`);
  }
  if (include("venue") || include("activity")) {
    if (pair) {
      if (include("venue")) {
        claims.push({ category, text: `Verified ${pair.baseSymbol}/${pair.quoteSymbol} pair ${pair.pairAddress} is reported by ${pair.dex}.`, citations: [5] });
        if (pair.liquidityUsd !== null) claims.push({ category, text: `Reported pool liquidity is ${pair.liquidityUsd} USD. Pool liquidity is not trade-size executable depth.`, citations: [5] });
        else unknowns.push("Pool liquidity is unavailable for the verified pair.");
      }
      if (include("activity")) for (const window of pair.windows) claims.push({ category, text: `${window.window === "h1" ? "1-hour" : "24-hour"} provider window: ${window.volumeUsd ?? "unavailable"} USD volume, ${window.buys ?? "unavailable"} buys and ${window.sells ?? "unavailable"} sells.`, citations: [5] });
      unknowns.push("The venue provider does not supply a source observation time for these aggregates.");
    } else unknowns.push(`Verified venue evidence is ${venue.state}; liquidity and activity are unavailable.`);
  }
  if (include("events")) {
    if (asset.events.state === "available") {
      claims.push({ category, text: `${asset.events.value.length} issuer corporate-action records are currently returned for this exact token.`, citations: [1, 3] });
      for (const event of asset.events.value.slice(0, 5)) claims.push({ category, text: `Issuer event ${event.type} has status ${event.status} and process date ${event.processDate || "unavailable"}.`, citations: [3] });
      if (asset.events.value.length > 5) unknowns.push("Additional issuer events are omitted from this bounded report.");
    }
    else unknowns.push(`Issuer events are ${asset.events.state}; no event count is claimed.`);
  }
  if (include("alerts")) unknowns.push("Alert history is local operator evidence and is shown separately from issuer and venue data.");
  if (include("policy")) {
    if (policy) {
      claims.push({ category, text: `Saved ${policy.evidence.direction} policy result for ${policy.evidence.inputAmount} raw input units was ${policy.decision.status} at ${policy.evidence.evaluatedAt}. This is a historical check.`, citations: [6] });
      for (const check of policy.decision.checks.slice(0, 12)) claims.push({ category, text: `${check.code.replaceAll("_", " ")} was ${check.status}: ${check.detail}`, citations: [6] });
      if (!policy.decision.expiresAt || Date.parse(policy.decision.expiresAt) <= now.getTime()) unknowns.push("Saved policy evidence is expired or has no expiry. Request a fresh route and policy check before action.");
    } else unknowns.push("No saved exact-input policy evidence was supplied. Eligibility is unavailable.");
  }
  const evidence = { assetKey, asset, venue, topic, policyHash: policy?.decision.evidenceHash || null, claims, unknowns };
  const evidenceHash = hashEvidence(evidence);
  return { id: hashEvidence({ evidenceHash, version: 1 }), version: 1, kind: topic, assetKey, symbol: asset.symbol, generatedAt: now.toISOString(), evidenceHash, claims, citations, unknowns, model: null, promptVersion: null, usage: null };
}

export function withModelAnswer(report: AgentReport, result: AnalystResult): AgentReport {
  if (result.state !== "available") return report;
  const claims = result.text.split(/\n\s*\n/).map((text) => ({ text, citations: [...new Set([...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])))] }));
  return { ...report, kind: "model_answer", claims, model: result.model || "openai/gpt-6-luna", promptVersion: 1, usage: result.usage ?? null };
}

export function buildProposal(report: AgentReport, direction: "buy" | "sell", amount: string): ActionProposal | null {
  const validAmount = direction === "buy" ? /^(0|[1-9]\d*)(\.\d{1,6})?$/ : /^(0|[1-9]\d*)(\.\d{1,18})?$/;
  if (!validAmount.test(amount) || Number(amount) <= 0 || Number(amount) > (direction === "buy" ? 10 : 1000000)) return null;
  const inputUnit = direction === "buy" ? "USDG" : report.symbol;
  const handoffUrl = `/market/${encodeURIComponent(report.symbol)}?direction=${direction}&amount=${encodeURIComponent(amount)}#action`;
  return { id: hashEvidence({ report: report.id, direction, amount }), version: 1, assetKey: report.assetKey, symbol: report.symbol, direction, amount, inputUnit, generatedAt: new Date().toISOString(), evidenceHash: report.evidenceHash, reportId: report.id, handoffUrl, state: "unsigned" };
}

export function proposalMatches(proposal: ActionProposal, assetKey: string, symbol: string, direction: "buy" | "sell", inputAmount: string, now = new Date()): boolean {
  const age = now.getTime() - Date.parse(proposal.generatedAt);
  if (proposal.state !== "unsigned" || proposal.assetKey !== assetKey || proposal.symbol !== symbol || proposal.direction !== direction || !Number.isFinite(age) || age < 0 || age > 300000) return false;
  const [whole, fraction = ""] = proposal.amount.split(".");
  const decimals = direction === "buy" ? 6 : 18;
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > decimals) return false;
  return BigInt(whole + fraction.padEnd(decimals, "0")).toString() === inputAmount;
}
