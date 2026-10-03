"use client";

import { useEffect, useState } from "react";
import type { SourcedAsset } from "@/lib/robinhood-data";
import type { XStockListing } from "@/lib/xstocks-catalog";
import { sourceValue } from "@/lib/observations";
import { emptyResearchState, evaluateResearch, instrumentKey, readResearchState, type ResearchState, type RuleKind } from "@/lib/research-state";
import type { VenueResult } from "@/lib/venue-market";

const storageKey = "stockscope:research:v1";

export function ResearchTools({ assets, xstocks = [] }: { assets: SourcedAsset[]; xstocks?: XStockListing[] }) {
  const [state, setState] = useState<ResearchState>(emptyResearchState);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RuleKind>("liquidity_below");
  const [threshold, setThreshold] = useState("");
  const [selected, setSelected] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const keyed = [...assets.flatMap((asset) => {
    const identity = sourceValue(asset.identity);
    return identity ? [{ key: instrumentKey("robinhood", 4663, identity.contract), symbol: asset.symbol, issuer: "robinhood" as const }] : [];
  }), ...xstocks.map((asset) => ({ key: instrumentKey("xstocks", 42161, asset.contract), symbol: asset.symbol, issuer: "xstocks" as const }))].filter((item, index, all) => all.findIndex((entry) => entry.key === item.key) === index);

  useEffect(() => {
    const restore = () => {
      try {
        const next = readResearchState(localStorage.getItem(storageKey));
        setState((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
        setLoaded(true);
      } catch { setSyncMessage("Browser storage unavailable. Watchlists cannot be persisted."); }
    };
    queueMicrotask(restore);
    window.addEventListener("stockscope:researchchange", restore);
    window.addEventListener("storage", restore);
    return () => { window.removeEventListener("stockscope:researchchange", restore); window.removeEventListener("storage", restore); };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      const next = JSON.stringify(state);
      if (localStorage.getItem(storageKey) !== next) {
        localStorage.setItem(storageKey, next);
        window.dispatchEvent(new Event("stockscope:researchchange"));
      }
    } catch { queueMicrotask(() => setSyncMessage("Watchlist changes could not be saved in this browser.")); }
  }, [loaded, state]);

  function saveView() {
    const label = name.trim().slice(0, 40);
    if (!label) return;
    setState((current) => ({ ...current, views: [...current.views, { id: crypto.randomUUID(), name: label, query: window.location.search }].slice(-20) }));
    setName("");
  }

  async function syncWorkspace(load: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", load ? { cache: "no-store" } : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watchlist: state.watchlist, views: state.views }) });
      if (!response.ok) { setSyncMessage(response.status === 401 ? "Sign in to save or load your account workspace." : "Account workspace unavailable."); return; }
      if (load) {
        const workspace = await response.json() as Pick<ResearchState, "watchlist" | "views">;
        setState((current) => ({ ...current, watchlist: workspace.watchlist, views: workspace.views }));
      }
      setSyncMessage(load ? "Account watchlist and views loaded into this browser." : "Watchlist and views saved to your account.");
    } catch { setSyncMessage("Account workspace unavailable."); }
    finally { setBusy(false); }
  }

  function addRule() {
    if (!selected || (kind === "issuer_event" && selected.startsWith("xstocks:")) || (kind === "liquidity_below" && (!Number.isFinite(Number(threshold)) || Number(threshold) <= 0))) return;
    setState((current) => ({ ...current, rules: [...current.rules, { id: crypto.randomUUID(), assetKey: selected, kind, threshold: kind === "liquidity_below" ? Number(threshold) : undefined }] }));
  }

  async function refresh() {
    setBusy(true);
    for (const entry of keyed.filter((item) => state.watchlist.includes(item.key))) {
      let venue: VenueResult;
      let eventIds: string[] = [];
      let eventsAvailable = false;
      try {
        const [venueResponse, eventsResponse] = await Promise.all([fetch(`/api/market/venues?symbol=${entry.symbol}${entry.issuer === "xstocks" ? "&issuer=xstocks" : ""}`, { cache: "no-store" }), entry.issuer === "robinhood" ? fetch(`/api/research/events?symbol=${entry.symbol}`, { cache: "no-store" }) : Promise.resolve(null)]);
        if (!venueResponse.ok) throw new Error("venue_unavailable");
        venue = await venueResponse.json() as VenueResult;
        const events = eventsResponse?.ok ? await eventsResponse.json() as { state: string; eventIds: string[] } : null;
        if (events?.state === "available" && Array.isArray(events.eventIds)) { eventIds = events.eventIds; eventsAvailable = true; }
      } catch { venue = { state: "error", reason: "request_failed", pairs: [], checkedAt: new Date().toISOString() }; }
      const pair = venue.state === "available" ? venue.pairs[0] : null;
      setState((current) => evaluateResearch(current, entry.key, { source: venue.state, liquidityUsd: pair?.liquidityUsd ? Number(pair.liquidityUsd) : null, pairUrl: pair?.sourceUrl || null, eventsAvailable, eventIds, checkedAt: venue.checkedAt }));
    }
    setBusy(false);
  }

  return <section className="research-tools" id="research" aria-labelledby="research-title"><div className="research-heading"><div><span className="section-kicker">REPEAT-USE RESEARCH</span><h2 id="research-title">Your desk</h2><p>Saved on this browser. Alerts are checked when you refresh observations here.</p></div><button type="button" onClick={refresh} disabled={busy || !state.watchlist.length}>{busy ? "Checking…" : "Refresh watched evidence"}</button></div>
    <div className="workflow-actions"><button type="button" disabled={busy} onClick={() => syncWorkspace(false)}>Save workspace to account</button><button type="button" disabled={busy} onClick={() => syncWorkspace(true)}>Load account workspace</button><a href="/account">Account</a></div><p className="cell-meta" role="status">{syncMessage}</p>
    <div className="research-columns"><div><h3>Watchlist</h3>{keyed.filter((item, index) => index < 6 || state.watchlist.includes(item.key)).map(({ key, symbol, issuer }) => <button className={`research-asset${state.watchlist.includes(key) ? " selected" : ""}`} aria-label={`${symbol} ${state.watchlist.includes(key) ? "Watching" : "Add"}`} type="button" key={key} aria-pressed={state.watchlist.includes(key)} onClick={() => setState((current) => ({ ...current, watchlist: current.watchlist.includes(key) ? current.watchlist.filter((item) => item !== key) : [...current.watchlist, key] }))}>{symbol} <small className="cell-meta">{issuer === "xstocks" ? "xStocks / Arbitrum One" : "Robinhood / Robinhood Chain"}</small><span>{state.watchlist.includes(key) ? "Watching" : "Add"}</span></button>)}<p className="cell-meta">Add any instrument from the market desk above. Exact issuer, chain and contract keys prevent ticker collisions.</p></div>
    <div><h3>Saved views</h3><div className="research-form"><input aria-label="View name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="View name" /><button type="button" onClick={saveView}>Save current view</button></div>{state.views.map((view) => <div className="research-item" key={view.id}><a href={`/terminal${view.query}`}>{view.name}</a><button type="button" aria-label={`Remove ${view.name}`} onClick={() => setState((current) => ({ ...current, views: current.views.filter((item) => item.id !== view.id) }))}>Remove</button></div>)}</div>
    <div><h3>Evidence alerts</h3><div className="research-form"><select aria-label="Alert asset" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose watched asset</option>{keyed.filter((item) => state.watchlist.includes(item.key)).map((item) => <option value={item.key} key={item.key}>{item.symbol}</option>)}</select><select aria-label="Alert rule" value={kind} onChange={(event) => setKind(event.target.value as RuleKind)}><option value="liquidity_below">Pool liquidity falls below</option><option value="source_unavailable">Venue source unavailable</option><option value="issuer_event" disabled={selected.startsWith("xstocks:")}>New issuer event (Robinhood)</option></select>{kind === "liquidity_below" ? <input aria-label="Liquidity threshold in USD" type="number" min="1" step="1" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="USD threshold" /> : null}<button type="button" onClick={addRule}>Add alert</button></div>{state.rules.map((rule) => <div className="research-item" key={rule.id}><span>{keyed.find((item) => item.key === rule.assetKey)?.symbol || "Asset"} · {rule.kind.replaceAll("_", " ")}{rule.threshold ? ` · $${rule.threshold}` : ""}</span><button type="button" onClick={() => setState((current) => ({ ...current, rules: current.rules.filter((item) => item.id !== rule.id) }))}>Remove</button></div>)}{state.alerts.map((alert) => <div className="research-alert" key={alert.id}><strong>{alert.message}</strong><a href={alert.evidenceUrl} target="_blank" rel="noopener noreferrer">Source evidence</a><span>{alert.observedAt}</span></div>)}</div></div>
  </section>;
}
