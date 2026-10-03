"use client";

import { useEffect, useState } from "react";
import type { VenueResult } from "@/lib/venue-market";

function money(value: string | null | undefined) {
  return value == null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(Number(value));
}

function change(value: number | null | undefined) {
  return value == null ? "Unavailable" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function VenueMarket({ symbol, issuer = "robinhood" }: { symbol: string; issuer?: "robinhood" | "xstocks" }) {
  const [result, setResult] = useState<VenueResult | null>(null);
  const [window, setWindow] = useState<"m5" | "h1" | "h6" | "h24">("h24");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => { queueMicrotask(() => { setResult(null); setFailure(""); }); }, [symbol, issuer]);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function load() {
      if (running || document.hidden || controller.signal.aborted) return;
      running = true; setBusy(true);
      try {
        const response = await fetch(`/api/market/venues?issuer=${issuer}&symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Venue request failed");
        const value = await response.json() as VenueResult;
        if (!controller.signal.aborted) { setResult(value); setFailure(""); }
      } catch { if (!controller.signal.aborted) setFailure("Activity refresh failed. Any retained observation is stale."); }
      finally { running = false; if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    const timer = globalThis.window.setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); globalThis.window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [symbol, issuer, refresh]);
  const pair = result?.state === "available" ? result.pairs[0] : null;
  const activity = pair?.windows.find((item) => item.window === window);
  const total = activity?.buys != null && activity.sells != null ? activity.buys + activity.sells : null;
  return <section className="detail-card venue-market" aria-labelledby="venue-market-title"><div className="card-header"><div><span className="section-kicker">VERIFIED PAIRS</span><h3 id="venue-market-title">Venue activity</h3></div><span className="card-tag">INDEXED / ONCHAIN IDENTITY</span></div>
    <div className="chart-toolbar"><div role="group" aria-label="Activity window">{(["m5", "h1", "h6", "h24"] as const).map((value) => <button key={value} aria-pressed={window === value} onClick={() => setWindow(value)}>{value === "m5" ? "5m" : value.slice(1) + "h"}</button>)}</div><button disabled={busy} onClick={() => setRefresh((value) => value + 1)}>{busy ? "Refreshing" : "Refresh activity"}</button></div>
    {failure ? <p className="workflow-message" role="status">{failure}</p> : null}
    {!result ? <p role="status">{failure || "Checking exact pools..."}</p> : result.state !== "available" ? <p role="status">Venue activity unavailable: {result.reason.replaceAll("_", " ")}. Verified sources are required for market data.</p> : <><p className="card-intro">{pair?.baseSymbol}/{pair?.quoteSymbol}: highest indexed liquidity among verified supported pools. Metrics below apply to this pool. Pool liquidity is a provider estimate, not executable depth.</p><dl className="market-metrics"><div><dt>Token price USD</dt><dd>{money(pair?.priceUsd)}</dd></div><div><dt>{window === "m5" ? "5m" : window.slice(1) + "h"} price change</dt><dd className={(activity?.changePercent ?? 0) < 0 ? "market-down" : "market-up"}>{change(activity?.changePercent)}</dd></div><div><dt>Volume USD</dt><dd>{money(activity?.volumeUsd)}</dd></div><div><dt>Transactions</dt><dd>{total?.toLocaleString() ?? "Unavailable"}</dd></div><div><dt>Buys / sells</dt><dd>{activity?.buys ?? "?"} / {activity?.sells ?? "?"}</dd></div><div><dt>Buyers / sellers</dt><dd>{activity?.buyers ?? "?"} / {activity?.sellers ?? "?"}</dd></div></dl>{total !== null && total > 0 ? <div className="activity-balance" role="img" aria-label={`${activity!.buys} buys and ${activity!.sells} sells in the selected window`}><span style={{ width: `${activity!.buys! / total * 100}%` }} /></div> : null}<div className="table-wrap"><table className="venue-table"><thead><tr><th>Pair / pool</th><th>Token price USD</th><th>24h change</th><th>1h buys / sells</th><th>1h volume</th><th>24h volume</th><th>Pool liquidity</th></tr></thead><tbody>{result.pairs.map((item) => <tr key={item.pairAddress}><td><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.baseSymbol}/{item.quoteSymbol} · {item.dex}</a><span className="cell-meta">{item.pairAddress}</span><span className="cell-meta">{item.createdAt ? `Created ${new Date(item.createdAt).toLocaleDateString()}` : "Creation unavailable"} · provider reported</span><span className="cell-meta">Retrieved {item.retrievedAt}</span></td><td>{money(item.priceUsd)}</td><td>{change(item.windows.find((row) => row.window === "h24")?.changePercent)}</td><td>{item.windows[0].buys ?? "?"} / {item.windows[0].sells ?? "?"}</td><td>{money(item.windows[0].volumeUsd)}</td><td>{money(item.windows[1].volumeUsd)}</td><td>{money(item.liquidityUsd)}</td></tr>)}</tbody></table></div><p className="cell-meta">Provider window aggregates for each named pool. Source observation time is unknown. Refreshes every minute while this page is visible. Buy/sell counts are trades, not unique people.</p></>}
  </section>;
}

export function VenueSummary({ symbol }: { symbol: string }) {
  const [result, setResult] = useState<VenueResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/market/venues?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal }).then((response) => response.json()).then((value: VenueResult) => setResult(value)).catch(() => { if (!controller.signal.aborted) setResult({ state: "error", reason: "provider_unavailable", pairs: [], checkedAt: new Date().toISOString() }); });
    return () => controller.abort();
  }, [symbol]);
  if (!result) return <span className="cell-meta">Checking verified pairs…</span>;
  if (result.state !== "available") return <><span>Venue activity unavailable</span><span className="cell-meta">{result.reason.replaceAll("_", " ")}</span></>;
  const pair = result.pairs[0];
  return <><a className="external-link" href={pair.sourceUrl} target="_blank" rel="noopener noreferrer">{pair.baseSymbol}/{pair.quoteSymbol} · {pair.dex}</a><span className="cell-meta">Token price: {money(pair.priceUsd)} · 24h change: {change(pair.windows.find((row) => row.window === "h24")?.changePercent)}</span><span className="cell-meta">24h volume: {money(pair.windows[1].volumeUsd)} · Pool liquidity: {money(pair.liquidityUsd)}</span><span className="cell-meta">Retrieved {pair.retrievedAt} · source time unknown</span></>;
}
