"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { CandleHistory, CandleInterval } from "@/lib/candle-history";
import { InfoTip } from "./info-tip";
const CandleCanvas = dynamic(() => import("./candle-canvas"), { ssr: false, loading: () => <div className="candle-placeholder" role="status">Opening chart...</div> });
export function TokenCandles({ symbol, issuer = "xstocks" }: { symbol: string; issuer?: "robinhood" | "xstocks" }) {
  const [interval, setInterval] = useState<CandleInterval>("1h");
  const [range, setRange] = useState(30);
  const [history, setHistory] = useState<CandleHistory | null>(null);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState("");
  const [view, setView] = useState<"candles" | "line">("candles");
  const [refresh, setRefresh] = useState(0);
  const chainId = issuer === "robinhood" ? 4663 : 42161;
  const network = issuer === "robinhood" ? "Robinhood Chain" : "Arbitrum One";
  useEffect(() => { queueMicrotask(() => { setHistory(null); setFailure(""); }); }, [symbol, interval, issuer]);
  useEffect(() => {
    const abort = new AbortController();
    let running = false;
    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      setBusy(true);
      try {
        const response = await fetch(`/api/market/history?issuer=${issuer}&chainId=${chainId}&symbol=${encodeURIComponent(symbol)}&interval=${interval}`, { signal: abort.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Chart request failed.");
        const result = await response.json() as CandleHistory;
        if (abort.signal.aborted) return;
        setHistory(result); setFailure("");
      } catch { if (!abort.signal.aborted) setFailure("The chart could not refresh. Any previous observation is stale."); }
      finally { running = false; if (!abort.signal.aborted) setBusy(false); }
    }
    queueMicrotask(() => { if (!abort.signal.aborted) void refresh(); });
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { abort.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [symbol, interval, issuer, chainId, refresh]);
  const candles = history?.candles.filter((bar) => bar.time >= Date.parse(history.retrievedAt) / 1000 - range * 86400) || [];
  const last = candles.at(-1);
  const first = candles[0];
  const move = last && first ? (last.close / first.open - 1) * 100 : null;
  return <section className="detail-card chart-card" aria-labelledby="market-context-title"><div className="card-header"><div><span className="section-kicker">{network.toUpperCase()} / TOKEN MARKET</span><h2 id="market-context-title">{symbol} candlesticks <InfoTip label="Candlesticks">Each candle shows the opening, highest, lowest, and closing token price from indexed pool trades. Green closes above its open; red closes below it. Volume is traded USD. Empty intervals have no fabricated prices.</InfoTip></h2></div><span className={`card-tag ${history?.state === "stale" || failure ? "status-review" : ""}`}>{busy ? "CHECKING SOURCE" : history?.state === "available" && !failure ? "INDEXED TRADES" : "UNAVAILABLE / STALE"}</span></div><div className="chart-toolbar"><div role="group" aria-label="Candle interval">{(["15m", "1h", "1d"] as const).map((value) => <button key={value} aria-pressed={interval === value} onClick={() => setInterval(value)}>{value}</button>)}</div><div role="group" aria-label="Chart range">{[1, 7, 30].map((days) => <button key={days} aria-pressed={range === days} onClick={() => setRange(days)}>{days === 1 ? "24h" : `${days}d`}</button>)}</div><div role="group" aria-label="Chart style">{(["candles", "line"] as const).map((value) => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>{value === "candles" ? "Candles" : "Line"}</button>)}</div><button disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Refresh chart</button></div>
    <div className="chart-price"><strong>{last ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(last.close) : "Price unavailable"}</strong><span>USD per {symbol} token / last indexed close</span></div>
    {candles.length ? <><dl className="market-metrics chart-metrics"><div><dt>First open to last close</dt><dd className={(move ?? 0) < 0 ? "market-down" : "market-up"}>{move !== null ? `${move > 0 ? "+" : ""}${move.toFixed(2)}%` : "Unavailable"}</dd></div><div><dt>Indexed range high / low</dt><dd>${Math.max(...candles.map((bar) => bar.high)).toFixed(4)} / ${Math.min(...candles.map((bar) => bar.low)).toFixed(4)}</dd></div><div><dt>Displayed volume USD</dt><dd>${candles.reduce((sum, bar) => sum + bar.volume, 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</dd></div><div><dt>Indexed candles</dt><dd>{candles.length} / max 300</dd></div></dl><p className="cell-meta">Displayed data: {new Date(first.time * 1000).toISOString()} through {new Date(last!.time * 1000).toISOString()}. These statistics cover the displayed bars, which may span less than the selected range.</p><CandleCanvas candles={candles} interval={interval} view={view} /></> : <div className="candle-placeholder" role="status">{busy ? "Verifying the issuer, token units, and pool initialization before showing candles." : history?.reason || (history?.candles.length ? "No indexed trades in this range. Choose a longer range." : failure || "Verified candles are unavailable.")}</div>}
    {history?.reason || failure ? <p className="workflow-message" role="status">{failure || history?.reason}</p> : null}
    <div className="chart-legend"><span><i className="legend-up" />Close above open</span><span><i className="legend-down" />Close below open</span><span>Volume in USD</span></div>
    <p className="cell-meta">Last indexed candle: {history?.lastTradeAt ? new Date(history.lastTradeAt).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" : "Unavailable"}. Sparse trading may leave gaps. The current interval can change.</p>
    <details className="source-details"><summary>Source, coverage, and candle data</summary><div className="source-meta"><a href={history?.sourceUrl || "https://www.geckoterminal.com"} target="_blank" rel="noopener noreferrer">GeckoTerminal / CoinGecko</a><span>Pool: {history?.pool || "Unverified"}</span><span>Contract: {history?.contract || "Unverified"}</span><span>{network} / {chainId} / USD per token / volume USD</span><span>Retrieved: {history?.retrievedAt || "Unavailable"}</span><span>Missing intervals: {history?.gaps ?? "Unknown"}. No forward filling.</span><span>{history?.finality || "Finality unverified"}. Exact last trade time is not supplied by this candle endpoint.</span></div>{candles.length ? <div className="table-wrap"><table className="venue-table"><caption>Latest 20 indexed candles, UTC</caption><thead><tr><th>Time</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume USD</th></tr></thead><tbody>{candles.slice(-20).reverse().map((bar) => <tr key={bar.time}><td>{new Date(bar.time * 1000).toISOString()}</td>{[bar.open, bar.high, bar.low, bar.close, bar.volume].map((value, index) => <td key={index}>{value.toFixed(4)}</td>)}</tr>)}</tbody></table></div> : null}</details><p className="cell-meta">TradingView Lightweight Charts™ / Copyright (с) 2025 TradingView, Inc. / <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts</a>. Market data by <a href="https://www.geckoterminal.com/" target="_blank" rel="noopener noreferrer">GeckoTerminal</a>. This panel is research, not a trade quote.</p></section>;
}
