import { LocalStore } from "./local-store";
import { hashEvidence } from "./policy";
import { getSourcedAsset, robinhoodSymbols } from "./robinhood-data";
import { getXStock } from "./xstocks-catalog";
import { robinhoodVenue } from "./venue-market";
import { instrumentKey, type RuleKind } from "./research-state";

export interface MonitoredRule { id: string; version: number; assetKey: string; symbol: string; kind: RuleKind; threshold?: number; enabled: boolean }
export interface MonitorObservation { id: string; assetKey: string; symbol: string; checkedAt: string; sourceTime: string | null; source: "available" | "unavailable" | "error" | "stale"; liquidityUsd: number | null; pairUrl: string | null; eventIds: string[]; eventsAvailable: boolean; reason: string | null }
export interface MonitorAlert { id: string; kind: RuleKind | "source_health"; ruleId: string | null; ruleVersion: number | null; assetKey: string; message: string; priorId: string | null; currentId: string; evidenceHash: string; evidenceUrl: string | null; evaluatedAt: string; delivery: "in_app"; prior: MonitorObservation | null; current: MonitorObservation }
interface MonitorState { rules: MonitoredRule[]; observations: MonitorObservation[]; latest: Record<string, MonitorObservation>; alerts: MonitorAlert[]; sequences: Record<string, number> }
const initial = (): MonitorState => ({ rules: [], observations: [], latest: {}, alerts: [], sequences: {} });
const store = (directory?: string) => new LocalStore<MonitorState>("monitor", initial, directory);
const addressPattern = /^0x[\da-f]{40}$/i;

export function validRule(rule: MonitoredRule): boolean {
  const parts = rule.assetKey.split(":");
  return /^[\da-f-]{8,64}$/i.test(rule.id) && Number.isInteger(rule.version) && rule.version > 0 && rule.version <= 1000 && parts.length === 3 && ["robinhood", "xstocks"].includes(parts[0]) && Number(parts[1]) === (parts[0] === "robinhood" ? 4663 : 42161) && addressPattern.test(parts[2]) && instrumentKey(parts[0] as "robinhood" | "xstocks", Number(parts[1]), parts[2]) === rule.assetKey && typeof rule.symbol === "string" && rule.symbol.length <= 16 && ["liquidity_below", "source_unavailable", "issuer_event"].includes(rule.kind) && !(parts[0] === "xstocks" && rule.kind === "issuer_event") && typeof rule.enabled === "boolean" && (rule.kind !== "liquidity_below" || (typeof rule.threshold === "number" && Number.isFinite(rule.threshold) && rule.threshold > 0 && rule.threshold <= 1_000_000_000));
}

export async function verifiedRule(rule: MonitoredRule, providers: { robinhood: typeof getSourcedAsset; xstocks: typeof getXStock } = { robinhood: getSourcedAsset, xstocks: getXStock }): Promise<boolean> {
  if (!validRule(rule)) return false;
  if (rule.assetKey.startsWith("robinhood:")) {
    if (!(robinhoodSymbols as readonly string[]).includes(rule.symbol)) return false;
    const asset = await providers.robinhood(rule.symbol);
    return asset.identity.state === "available" && asset.chain.state === "available" && instrumentKey("robinhood", 4663, asset.identity.value.contract) === rule.assetKey;
  }
  const asset = await providers.xstocks(rule.symbol);
  return !!asset && asset.state === "verified" && instrumentKey("xstocks", 42161, asset.contract) === rule.assetKey;
}

export async function saveRules(rules: MonitoredRule[], directory?: string, verify = verifiedRule): Promise<{ imported: number; total: number }> {
  if (!Array.isArray(rules) || rules.length > 100 || rules.some((rule) => !validRule(rule))) throw new Error("invalid_rules");
  const existing = (await readMonitor(directory)).rules;
  for (const rule of rules) if (!existing.some((item) => item.id === rule.id && item.version >= rule.version) && !(await verify(rule))) throw new Error("identity_unverified");
  return store(directory).transaction((state) => {
    let imported = 0;
    for (const rule of rules) {
      const existing = state.rules.findIndex((item) => item.id === rule.id);
      if (existing < 0) { state.rules.push(rule); imported++; }
      else if (rule.version > state.rules[existing].version) { state.rules[existing] = rule; imported++; }
    }
    if (state.rules.length > 100) throw new Error("rule_limit");
    return { imported, total: state.rules.length };
  });
}

export async function removeRule(id: string, directory?: string): Promise<void> {
  await store(directory).transaction((state) => { state.rules = state.rules.filter((rule) => rule.id !== id); });
}

export async function removeAlert(id: string, directory?: string): Promise<void> {
  await store(directory).transaction((state) => { state.alerts = state.alerts.filter((alert) => alert.id !== id); });
}

export async function readMonitor(directory?: string): Promise<MonitorState> {
  return store(directory).transaction((state) => ({ rules: state.rules.slice(0, 100), observations: state.observations.slice(-200), latest: state.latest, alerts: state.alerts.slice(-200), sequences: state.sequences || {} }));
}

export function observation(input: Omit<MonitorObservation, "id">): MonitorObservation {
  const id = hashEvidence({ assetKey: input.assetKey, sourceTime: input.sourceTime, source: input.source, liquidityUsd: input.liquidityUsd, pairUrl: input.pairUrl, eventIds: [...input.eventIds].sort(), eventsAvailable: input.eventsAvailable, reason: input.reason });
  return { ...input, eventIds: [...input.eventIds].sort(), id };
}

export function evaluateObservation(state: MonitorState, next: MonitorObservation, now = new Date()): MonitorAlert[] {
  const prior = state.latest[next.assetKey] || null;
  if (prior?.sourceTime && next.sourceTime && Date.parse(next.sourceTime) < Date.parse(prior.sourceTime)) return [];
  if (prior && Date.parse(next.checkedAt) < Date.parse(prior.checkedAt)) return [];
  const previousPoll = [...state.observations].reverse().find((item) => item.assetKey === next.assetKey);
  const changed = !previousPoll || previousPoll.id !== next.id || previousPoll.source !== next.source;
  if (changed) {
    state.observations.push(next);
    state.sequences ||= {};
    state.sequences[next.assetKey] = (state.sequences[next.assetKey] || 0) + 1;
  }
  const alerts: MonitorAlert[] = [];
  const emit = (kind: MonitorAlert["kind"], rule: MonitoredRule | null, message: string, evidenceUrl: string | null, eventId: string | null = null) => {
    const id = hashEvidence({ kind, ruleId: rule?.id, version: rule?.version, sequence: state.sequences[next.assetKey], prior: prior?.id, next: next.id, eventId });
    if (state.alerts.some((item) => item.id === id)) return;
    const current: MonitorAlert = { id, kind, ruleId: rule?.id || null, ruleVersion: rule?.version || null, assetKey: next.assetKey, message, priorId: prior?.id || null, currentId: next.id, evidenceHash: hashEvidence({ prior, next, rule }), evidenceUrl, evaluatedAt: now.toISOString(), delivery: "in_app", prior, current: next };
    alerts.push(current);
    state.alerts.push(current);
  };
  if (next.source === "error") {
    if (previousPoll?.source !== "error") emit("source_health", null, `Source or identity verification failed for ${next.symbol}. Market alerts were not evaluated.`, next.pairUrl);
    return alerts;
  }
  if (next.source === "stale") return alerts;
  if (!prior) { state.latest[next.assetKey] = next; return alerts; }
  if (prior.id === next.id) return alerts;
  for (const rule of state.rules.filter((item) => item.enabled && item.assetKey === next.assetKey)) {
    if (rule.kind === "liquidity_below" && prior.source === "available" && next.source === "available" && prior.liquidityUsd !== null && next.liquidityUsd !== null && prior.liquidityUsd >= rule.threshold! && next.liquidityUsd < rule.threshold!) emit(rule.kind, rule, `Pool liquidity fell below $${rule.threshold}.`, next.pairUrl);
    if (rule.kind === "source_unavailable" && prior.source === "available" && next.source === "unavailable") emit(rule.kind, rule, `Verified venue became unavailable for ${next.symbol}.`, next.pairUrl);
    if (rule.kind === "issuer_event" && prior.eventsAvailable && next.eventsAvailable) for (const eventId of next.eventIds.filter((id) => !prior.eventIds.includes(id))) emit(rule.kind, rule, `New issuer event ${eventId}.`, "https://api.robinhood.com/rhj/corporate-actions", eventId);
  }
  state.latest[next.assetKey] = next;
  return alerts;
}

export async function collectObservation(rule: MonitoredRule): Promise<MonitorObservation> {
  const checkedAt = new Date().toISOString();
  if (rule.assetKey.startsWith("xstocks:")) {
    const asset = await getXStock(rule.symbol);
    if (!asset || asset.state !== "verified" || instrumentKey("xstocks", 42161, asset.contract) !== rule.assetKey) return observation({ assetKey: rule.assetKey, symbol: rule.symbol, checkedAt, sourceTime: null, source: "error", liquidityUsd: null, pairUrl: null, eventIds: [], eventsAvailable: false, reason: "identity_unverified" });
    const venue = asset.venue;
    const pair = venue?.state === "available" ? venue.pairs[0] : null;
    return observation({ assetKey: rule.assetKey, symbol: rule.symbol, checkedAt, sourceTime: null, source: venue?.state || "unavailable", liquidityUsd: pair?.liquidityUsd === null || !pair ? null : Number(pair.liquidityUsd), pairUrl: pair?.sourceUrl || null, eventIds: [], eventsAvailable: false, reason: venue?.state === "available" ? null : venue?.reason || "venue_unavailable" });
  }
  const asset = await getSourcedAsset(rule.symbol);
  if (asset.identity.state !== "available" || asset.chain.state !== "available") return observation({ assetKey: rule.assetKey, symbol: rule.symbol, checkedAt, sourceTime: null, source: "error", liquidityUsd: null, pairUrl: null, eventIds: [], eventsAvailable: false, reason: "identity_unverified" });
  if (instrumentKey("robinhood", 4663, asset.identity.value.contract) !== rule.assetKey) return observation({ assetKey: rule.assetKey, symbol: rule.symbol, checkedAt, sourceTime: null, source: "error", liquidityUsd: null, pairUrl: null, eventIds: [], eventsAvailable: false, reason: "contract_changed" });
  const venue = await robinhoodVenue(asset.identity.value.contract);
  const pair = venue.state === "available" ? venue.pairs[0] : null;
  return observation({ assetKey: rule.assetKey, symbol: rule.symbol, checkedAt, sourceTime: asset.events.source.observedAt, source: venue.state, liquidityUsd: pair?.liquidityUsd === null || !pair ? null : Number(pair.liquidityUsd), pairUrl: pair?.sourceUrl || null, eventIds: asset.events.state === "available" ? asset.events.value.map((event) => `${event.id}:${event.type}:${event.processDate}:${JSON.stringify(event.details)}`) : [], eventsAvailable: asset.events.state === "available", reason: venue.state === "available" ? null : venue.reason });
}

export async function runMonitor(directory?: string, load = collectObservation): Promise<{ checked: number; alerts: number; errors: number }> {
  const rules = (await readMonitor(directory)).rules.filter((rule) => rule.enabled);
  const unique = [...new Map(rules.map((rule) => [rule.assetKey, rule])).values()].slice(0, 25);
  let alerts = 0;
  let errors = 0;
  for (const rule of unique) {
    let next: MonitorObservation;
    try { next = await load(rule); }
    catch { errors++; next = observation({ assetKey: rule.assetKey, symbol: rule.symbol, checkedAt: new Date().toISOString(), sourceTime: null, source: "error", liquidityUsd: null, pairUrl: null, eventIds: [], eventsAvailable: false, reason: "request_failed" }); }
    alerts += await store(directory).transaction((state) => {
      const emitted = evaluateObservation(state, next).length;
      const cutoff = Date.now() - 90 * 86400000;
      const referenced = new Set(state.alerts.flatMap((alert) => [alert.priorId, alert.currentId]));
      state.observations = state.observations.filter((item) => referenced.has(item.id) || Date.parse(item.checkedAt) >= cutoff).slice(-2500);
      state.alerts = state.alerts.slice(-1000);
      return emitted;
    });
  }
  return { checked: unique.length, alerts, errors };
}
