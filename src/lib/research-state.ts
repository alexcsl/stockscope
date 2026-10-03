export type RuleKind = "liquidity_below" | "source_unavailable" | "issuer_event";
export interface AlertRule { id: string; assetKey: string; kind: RuleKind; threshold?: number }
export interface ResearchAlert { id: string; ruleId: string; assetKey: string; message: string; evidenceUrl: string; observedAt: string }
export interface ResearchSnapshot { source: "available" | "unavailable" | "error"; liquidityUsd: number | null; pairUrl: string | null; eventsAvailable: boolean; eventIds: string[]; checkedAt: string }
export interface ResearchState { watchlist: string[]; views: { id: string; name: string; query: string }[]; rules: AlertRule[]; alerts: ResearchAlert[]; snapshots: Record<string, ResearchSnapshot> }

export const emptyResearchState: ResearchState = { watchlist: [], views: [], rules: [], alerts: [], snapshots: {} };

export function instrumentKey(issuer: "robinhood" | "xstocks", chainId: number, contract: string): string {
  return `${issuer}:${chainId}:${contract.toLowerCase()}`;
}

export function evaluateResearch(state: ResearchState, assetKey: string, next: ResearchSnapshot): ResearchState {
  const previous = state.snapshots[assetKey];
  const alerts = [...state.alerts];
  for (const rule of state.rules.filter((item) => item.assetKey === assetKey)) {
    let message: string | null = null;
    let evidenceUrl: string | null = null;
    let evidenceId: string | null = null;
    if (rule.kind === "liquidity_below" && previous?.source === "available" && next.source === "available" && previous.liquidityUsd !== null && next.liquidityUsd !== null && Number.isFinite(rule.threshold) && previous.liquidityUsd >= rule.threshold! && next.liquidityUsd < rule.threshold! && next.pairUrl) {
      message = `Pool liquidity fell below $${rule.threshold}`;
      evidenceUrl = next.pairUrl;
      evidenceId = `${next.pairUrl}:${next.liquidityUsd}:${next.checkedAt}`;
    }
    if (rule.kind === "source_unavailable" && previous?.source === "available" && next.source !== "available") {
      message = "Venue source became unavailable";
      evidenceUrl = "https://docs.dexscreener.com/api/reference";
      evidenceId = `${previous.checkedAt}:${next.source}`;
    }
    if (rule.kind === "issuer_event" && previous?.eventsAvailable && next.eventsAvailable) {
      const eventId = next.eventIds.find((id) => !previous.eventIds.includes(id));
      if (eventId) {
        message = `New issuer event ${eventId}`;
        evidenceUrl = assetKey.startsWith("robinhood:") ? "https://api.robinhood.com/rhj/corporate-actions" : "https://docs.xstocks.fi/developers";
        evidenceId = eventId;
      }
    }
    if (message && evidenceUrl && evidenceId) {
      const id = `${rule.id}:${evidenceId}`;
      if (!alerts.some((alert) => alert.id === id)) alerts.unshift({ id, ruleId: rule.id, assetKey, message, evidenceUrl, observedAt: next.checkedAt });
    }
  }
  return { ...state, alerts: alerts.slice(0, 100), snapshots: { ...state.snapshots, [assetKey]: next } };
}

export function readResearchState(raw: string | null): ResearchState {
  if (!raw) return structuredClone(emptyResearchState);
  try {
    const state: unknown = JSON.parse(raw);
    if (!state || typeof state !== "object" || Array.isArray(state)) return structuredClone(emptyResearchState);
    const item = state as Partial<ResearchState>;
    return { watchlist: Array.isArray(item.watchlist) ? item.watchlist.filter((key): key is string => typeof key === "string") : [], views: Array.isArray(item.views) ? item.views.filter((view) => typeof view?.id === "string" && typeof view.name === "string" && typeof view.query === "string") : [], rules: Array.isArray(item.rules) ? item.rules.filter((rule) => typeof rule?.id === "string" && typeof rule.assetKey === "string" && ["liquidity_below", "source_unavailable", "issuer_event"].includes(rule.kind)) : [], alerts: Array.isArray(item.alerts) ? item.alerts.filter((alert) => typeof alert?.id === "string" && typeof alert.evidenceUrl === "string") : [], snapshots: item.snapshots && typeof item.snapshots === "object" && !Array.isArray(item.snapshots) ? item.snapshots : {} };
  } catch { return structuredClone(emptyResearchState); }
}
