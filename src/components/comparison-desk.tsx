"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import type { CatalogSnapshot } from "@/lib/xstocks-catalog";
import type { ComparisonRecord, ComparisonSelection } from "@/lib/comparison";
import { InfoTip } from "./info-tip";
gsap.registerPlugin(useGSAP);

const keyOf = (item: ComparisonSelection) => `${item.issuer}:${item.symbol}`;
const money = (value: string | null | undefined) => value !== null && value !== undefined ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value)) : "Unavailable";
export function ComparisonDesk({ initialCatalog = null, embedded = false }: { initialCatalog?: CatalogSnapshot | null; embedded?: boolean }) {
  const results = useRef<HTMLElement>(null);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(initialCatalog);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [issuer, setIssuer] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ComparisonSelection[]>([]);
  const [records, setRecords] = useState<Record<string, ComparisonRecord>>({});
  const recordCache = useRef(new Map<string, { record: ComparisonRecord; expires: number }>());
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = results.current?.querySelectorAll(".comparison-card");
    if (cards?.length) gsap.fromTo(cards, { borderTopColor: "#304737" }, { borderTopColor: "#769c87", duration: 0.18, clearProps: "borderTopColor" });
  }, { scope: results, dependencies: [records], revertOnUpdate: true });
  useEffect(() => {
    const abort = new AbortController();
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      const raw = query.get("assets") || localStorage.getItem("stockscope:comparison") || "";
      const picks = raw.split(",").slice(0, 4).flatMap((entry): ComparisonSelection[] => {
        const [provider, symbol] = entry.split(":");
        if (provider === "robinhood" && ["AAPL", "NVDA", "TSLA"].includes(symbol)) return [{ issuer: provider, symbol }];
        if (provider === "xstocks" && /^[A-Za-z0-9]{1,15}x$/.test(symbol)) return [{ issuer: provider, symbol }];
        return [];
      });
      setSelected(picks.filter((item, index, all) => all.findIndex((other) => keyOf(other) === keyOf(item)) === index));
      setSearch(query.get(embedded ? "compareQ" : "q") || "");
    };
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("stockscope:deskchange", restore);
    if (!embedded) fetch("/api/market/catalog", { signal: abort.signal }).then(async (response) => { if (!response.ok) throw new Error(); setCatalog(await response.json()); }).catch(() => { if (!abort.signal.aborted) setError("The catalog could not load. Robinhood assets remain searchable."); });
    return () => { abort.abort(); window.removeEventListener("popstate", restore); window.removeEventListener("stockscope:deskchange", restore); };
  }, [embedded]);
  useEffect(() => {
    const abort = new AbortController();
    for (const item of selected) {
      const key = keyOf(item);
      const saved = recordCache.current.get(key);
      if (saved && saved.expires > Date.now()) { queueMicrotask(() => setRecords((current) => ({ ...current, [key]: saved.record }))); continue; }
      fetch(`/api/market/comparison?asset=${encodeURIComponent(key)}`, { signal: abort.signal }).then(async (response) => {
        if (!response.ok) throw new Error();
        const record = await response.json() as ComparisonRecord;
        if (recordCache.current.size >= 64) recordCache.current.delete(recordCache.current.keys().next().value!);
        recordCache.current.set(key, { record, expires: Date.now() + 60000 });
        setRecords((current) => ({ ...current, [key]: record }));
      }).catch(() => { if (!abort.signal.aborted) setRecords((current) => ({ ...current, [key]: { ...item, name: item.symbol, contract: null, state: "unavailable", multiplier: null, pair: null, reason: "Source requests failed. Refresh selected sources to retry." } })); });
    }
    return () => abort.abort();
  }, [selected]);
  function update(next: ComparisonSelection[], query = search) {
    setSelected(next);
    const params = new URLSearchParams(window.location.search);
    if (next.length) params.set("assets", next.map(keyOf).join(",")); else params.delete("assets");
    const searchKey = embedded ? "compareQ" : "q";
    if (query) params.set(searchKey, query); else params.delete(searchKey);
    params.delete("page");
    window.history.replaceState(null, "", `${embedded ? "/terminal" : "/compare"}?${params}${embedded ? "#compare" : ""}`);
    try { localStorage.setItem("stockscope:comparison", next.map(keyOf).join(",")); } catch {}
  }
  function toggle(item: ComparisonSelection) {
    const found = selected.some((entry) => keyOf(entry) === keyOf(item));
    if (!found && selected.length === 4) return;
    update(found ? selected.filter((entry) => keyOf(entry) !== keyOf(item)) : [...selected, item]);
  }
  const filtered = useMemo(() => {
    const all = [...["AAPL", "NVDA", "TSLA"].map((symbol) => ({ issuer: "robinhood" as const, symbol, name: `${symbol} Stock Token`, contract: "", chain: "Robinhood Chain" })), ...((embedded ? initialCatalog : catalog)?.assets || []).map((asset) => ({ ...asset, issuer: "xstocks" as const, chain: "Arbitrum One" }))];
    const needle = search.trim().toLowerCase();
    return all.filter((item) => (issuer === "all" || item.issuer === issuer) && `${item.symbol} ${item.name} ${item.contract}`.toLowerCase().includes(needle));
  }, [catalog, initialCatalog, embedded, search, issuer]);
  const activeCatalog = embedded ? initialCatalog : catalog;
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const ready = selected.map((item) => records[keyOf(item)]).filter((item): item is ComparisonRecord => !!item);
  const comparable = ready.length >= 2 && ready.every((item) => item.pair?.windows[0]?.window === "h1" && item.pair.windows[0].volumeUsd !== null) && ready.every((item) => item.pair?.sourceObservedAt !== null && item.pair?.sourceObservedAt === ready[0].pair?.sourceObservedAt);
  const maxVolume = Math.max(1, ...ready.map((item) => Number(item.pair?.windows[0]?.volumeUsd || 0)));
  return <>
    <section className="compare-selection detail-card"><div className="card-header"><h2>Find a stock token</h2><span className="card-tag">{filtered.length} results</span></div><div className="catalog-toolbar"><label>Search all discovered stocks<input type="search" value={search} placeholder="Symbol, company, or contract" onChange={(event) => { setSearch(event.target.value); setPage(0); update(selected, event.target.value); }} /></label><label>Issuer and chain<select value={issuer} onChange={(event) => { setIssuer(event.target.value); setPage(0); }}><option value="all">All issuers and chains</option><option value="xstocks">xStocks / Arbitrum One</option><option value="robinhood">Robinhood / Robinhood Chain</option></select></label></div>
      <p className="cell-meta" role="status">{error || (!activeCatalog ? "Loading the public catalog. You can select Robinhood assets now." : activeCatalog.complete ? `All discovered pages loaded. Updated ${new Date(activeCatalog.retrievedAt).toLocaleTimeString()}.` : activeCatalog.reason)}</p>
      <div className="catalog-grid">{filtered.slice(currentPage * 20, currentPage * 20 + 20).map((item) => { const active = selected.some((entry) => keyOf(entry) === keyOf(item)); return <button type="button" key={keyOf(item)} aria-pressed={active} disabled={!active && selected.length >= 4} className={`catalog-item${active ? " selected" : ""}`} onClick={() => toggle(item)}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><span className="cell-meta">{item.issuer === "xstocks" ? "xStocks" : "Robinhood"} / {item.chain}</span><span className="catalog-state">{active ? "Selected" : "Add to compare"}</span></button>; })}</div>
      {!filtered.length ? <p className="empty-state">No matching stocks. Try another company or symbol.</p> : null}
      <nav className="compare-pages" aria-label="Catalog pages"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pages}</span>{Array.from({ length: pages }, (_, index) => index).filter((index) => index === 0 || index === pages - 1 || Math.abs(index - currentPage) < 2).map((index, position, visible) => <span key={index}>{position > 0 && index - visible[position - 1] > 1 ? <span aria-hidden="true">...</span> : null}<button aria-current={currentPage === index ? "page" : undefined} onClick={() => setPage(index)}>{index + 1}</button></span>)}<button disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button></nav>
    </section>
    <section className="comparison-tray" aria-label="Selected comparison"><div><strong>{selected.length} of 4 selected</strong><span className="cell-meta">Selections stay in this browser.</span></div>{selected.map((item) => <button key={keyOf(item)} onClick={() => toggle(item)} aria-label={`Remove ${item.symbol}`}>{item.symbol} / Remove</button>)}{selected.length ? <button onClick={() => update([])}>Clear all</button> : null}</section>
    <section ref={results} className="compare-results detail-card"><div className="card-header"><h2>Compare evidence</h2><div className="workflow-actions"><button disabled={!selected.length} onClick={() => { recordCache.current.clear(); setRecords({}); setSelected([...selected]); }}>Refresh selected sources</button></div><InfoTip label="Comparable values">Charts require the same currency, window, source method, and observation time. Pool liquidity is money in a pool, not the amount your trade can safely use.</InfoTip></div>{!selected.length ? <p>Select up to four instruments above to begin.</p> : <div className="comparison-cards">{selected.map((item) => { const record = records[keyOf(item)]; return <article className="comparison-card" key={keyOf(item)}><h3>{item.symbol}</h3><p className="cell-meta">{item.issuer === "xstocks" ? "xStocks / Arbitrum One" : "Robinhood / Robinhood Chain"}</p>{!record ? <p role="status">Checking this instrument...</p> : <><span className={`status-badge ${record.state === "verified" ? "status-ready" : "status-review"}`}>{record.state === "verified" ? "Identity verified" : "Needs review"}</span><dl className="evidence-facts"><div><dt>1-hour volume</dt><dd>{money(record.pair?.windows[0]?.volumeUsd)}</dd></div><div><dt>Pool liquidity</dt><dd>{money(record.pair?.liquidityUsd)}</dd></div><div><dt>Shares per token <InfoTip label="Multiplier">Issuer conversion between token units and an underlying share. It does not establish ownership rights.</InfoTip></dt><dd>{record.multiplier || "Unverified"}</dd></div></dl>{comparable ? <div className="volume-bar" role="img" aria-label={`${item.symbol} 1-hour volume ${money(record.pair?.windows[0]?.volumeUsd)}`}><span style={{ width: `${Number(record.pair?.windows[0]?.volumeUsd || 0) / maxVolume * 100}%` }} /></div> : <p className="comparison-unavailable">Comparison chart unavailable: source observation times are unknown or windows do not match.</p>}<details className="source-details"><summary>Contract and source details</summary><p>{record.name}</p><code>{record.contract || "Contract unavailable"}</code><p>{record.pair ? <a href={record.pair.sourceUrl} target="_blank" rel="noopener noreferrer">{record.pair.baseSymbol}/{record.pair.quoteSymbol} / {record.pair.dex}</a> : record.reason.replaceAll("_", " ")}</p><p>Retrieved: {record.pair?.retrievedAt || "Unavailable"}. Source observation time: unknown.</p></details><Link href={item.issuer === "xstocks" ? `/xstocks/${item.symbol}` : `/market/${item.symbol.toLowerCase()}`}>Open asset research</Link></>}</article>; })}</div>}<p className="cell-meta">Issuer rights and reference prices remain separate. Displayed pool liquidity does not estimate trade execution.</p></section>
  </>;
}
