"use client";

import Link from "next/link";
import { useCallback, useRef, useSyncExternalStore } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Search, ArrowUpRight } from "lucide-react";
import type { SourcedAsset } from "@/lib/robinhood-data";
import type { CatalogSnapshot } from "@/lib/xstocks-catalog";
import { displayDecimal, sourceValue } from "@/lib/observations";
import { SourceLabel } from "./source-label";
import { VenueSummary } from "./venue-market";
import { WatchInstrument } from "./watch-instrument";

gsap.registerPlugin(useGSAP);

type Preset = "instrument" | "market" | "action";
type Filter = "all" | "verified" | "review";
type Sort = "symbol" | "name" | "contract" | "reference" | "identity";

function readDeskState(query: string) {
  const params = new URLSearchParams(query);
  const preset = params.get("view");
  const filter = params.get("filter");
  const sort = params.get("sort");
  return {
    market: params.get("market") === "xstocks" || params.get("market") === "robinhood" ? params.get("market")! : "all",
    page: Math.max(0, Math.floor(Number(params.get("deskPage")) || 0)),
    search: params.get("q") || "",
    filter: filter === "verified" || filter === "review" ? filter : "all" as Filter,
    preset: preset === "market" || preset === "action" ? preset : "instrument" as Preset,
    sort: sort || "",
  };
}

function updateDeskUrl(state: { search: string; filter: Filter; preset: Preset; sort: Sort }, historyMode: "push" | "replace") {
  const url = new URL(window.location.href);
  url.searchParams.delete("deskPage");
  for (const [key, value] of [["q", state.search], ["filter", state.filter], ["view", state.preset], ["sort", state.sort]] as const) {
    if (value && value !== "all" && value !== "instrument" && value !== "symbol") url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history[historyMode === "push" ? "pushState" : "replaceState"]({}, "", url);
  window.dispatchEvent(new Event("stockscope:deskchange"));
}

export function SourcedTerminal({ assets, initialQuery, catalog, catalogError, retryCatalog }: { assets: SourcedAsset[]; initialQuery: string; catalog: CatalogSnapshot | null; catalogError: string; retryCatalog: () => void }) {
  const searchEntry = useRef(false);
  const scope = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((callback: () => void) => {
    const restore = () => { searchEntry.current = false; callback(); };
    window.addEventListener("popstate", restore);
    window.addEventListener("stockscope:deskchange", callback);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("stockscope:deskchange", callback);
    };
  }, []);
  const query = useSyncExternalStore(subscribe, () => window.location.search, () => initialQuery);
  const state = readDeskState(query);
  const { search, filter, preset } = state;
  const availableSorts: Record<Preset, Sort[]> = { instrument: ["symbol", "name", "contract"], market: ["reference", "symbol"], action: ["identity", "symbol"] };
  const defaultSort: Sort = preset === "market" ? "reference" : preset === "action" ? "identity" : "symbol";
  const sort = availableSorts[preset].includes(state.sort as Sort) ? state.sort as Sort : defaultSort;

  const instruments = [
    ...assets.map((asset) => ({ symbol: asset.symbol, name: sourceValue(asset.identity)?.name || "Issuer identity unavailable", contract: sourceValue(asset.identity)?.contract || "", issuer: "robinhood" as const, chainId: 4663, verified: asset.chain.state === "available", sourced: asset })),
    ...(catalog?.assets || []).map((asset) => ({ symbol: asset.symbol, name: asset.name, contract: asset.contract, issuer: "xstocks" as const, chainId: 42161, verified: false, sourced: null })),
  ];
  const rows = instruments.filter((asset) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [asset.symbol, asset.name, asset.contract, asset.issuer].some((value) => value.toLowerCase().includes(needle));
    const matchesFilter = filter === "all" || (filter === "verified" ? asset.verified : !asset.verified);
    return matchesSearch && matchesFilter && (state.market === "all" || asset.issuer === state.market);
  }).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name) || a.symbol.localeCompare(b.symbol);
    if (sort === "contract") return a.contract.localeCompare(b.contract) || a.symbol.localeCompare(b.symbol);
    if (sort === "reference") return (a.sourced?.price.state === "available" ? 0 : 1) - (b.sourced?.price.state === "available" ? 0 : 1) || a.symbol.localeCompare(b.symbol);
    if (sort === "identity") return Number(b.verified) - Number(a.verified) || a.symbol.localeCompare(b.symbol);
    return a.symbol.localeCompare(b.symbol);
  });

  const changeSearch = (value: string) => {
    updateDeskUrl({ search: value, filter, preset, sort }, searchEntry.current ? "replace" : "push");
    searchEntry.current = value.length > 0;
  };
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(state.page, pages - 1);
  const changePage = (value: number) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("deskPage", String(value)); else url.searchParams.delete("deskPage");
    window.history.pushState({}, "", url);
    window.dispatchEvent(new Event("stockscope:deskchange"));
  };
  const changeFilter = (value: Filter) => {
    updateDeskUrl({ search, filter: value, preset, sort }, "push");
  };
  const changePreset = (value: Preset) => {
    const nextSort: Sort = value === "market" ? "reference" : value === "action" ? "identity" : "symbol";
    updateDeskUrl({ search, filter, preset: value, sort: nextSort }, "push");
  };
  const changeSort = (value: Sort) => {
    updateDeskUrl({ search, filter, preset, sort: value }, "push");
  };

  useGSAP(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(".sourced-row", { borderTopColor: "transparent" }, { borderTopColor: "#28352f", duration: .16, stagger: 0, ease: "power1.out", clearProps: "borderTopColor" });
  }, { scope, dependencies: [search, filter, preset, sort], revertOnUpdate: true });

  const sortOptions: Record<Preset, [Sort, string][]> = {
    instrument: [["symbol", "Symbol"], ["name", "Issuer name"], ["contract", "Contract"]],
    market: [["reference", "Reference availability"], ["symbol", "Symbol"]],
    action: [["identity", "Identity evidence"], ["symbol", "Symbol"]],
  };

  return <main className="page-shell sourced-main" ref={scope}>
    <div className="desk-heading"><div><span className="section-kicker">STOCKSCOPE / MULTI-MARKET RESEARCH</span><h1>Stock Tokens</h1><p>One terminal. Exact issuer, chain, and contract for every instrument.</p></div><div className="desk-links"><a className="external-link" href="#research">Your desk <ArrowUpRight size={14} /></a><a className="external-link" href="#compare">Compare issuers <ArrowUpRight size={14} /></a><Link className="external-link" href="/robinhood">Swap workspace <ArrowUpRight size={14} /></Link></div></div>
    <div className="data-notice"><strong>Source-backed observations</strong><span>References are issuer-reported. Venue quotes require a separate request. Missing depth, volume, and collateral evidence remain unavailable.</span></div>
    <div className="desk-summary" aria-label="Research coverage"><div><span>Tokens discovered</span><strong>{instruments.length}</strong><small>Current supported catalogs</small></div><div><span>Robinhood Chain</span><strong>{assets.length}</strong><small>Robinhood / 4663</small></div><div><span>xStocks</span><strong>{catalog?.assets.length ?? "Loading"}</strong><small>Backed / Arbitrum One / 42161</small></div><div><span>Identity verified</span><strong>{instruments.filter((asset) => asset.verified).length}</strong><small>Catalog listings need separate chain checks</small></div></div>
    <section className="market-panel" id="market" aria-label="Stock Token market">
      <div className="market-panel-top"><div><h2>Market desk</h2><p>{state.market === "all" ? "All supported markets" : state.market === "xstocks" ? "xStocks / Arbitrum One / 42161" : "Robinhood / Robinhood Chain / 4663"}</p></div><span className="card-tag">SOURCED</span></div>
      <div className="market-picker"><label>Market<select value={state.market} onChange={(event) => {
        const url = new URL(window.location.href);
        if (event.target.value === "all") url.searchParams.delete("market"); else url.searchParams.set("market", event.target.value);
        url.searchParams.delete("deskPage");
        window.history.pushState({}, "", url);
        window.dispatchEvent(new Event("stockscope:deskchange"));
      }}><option value="all">All issuers and chains</option><option value="robinhood">Robinhood / Robinhood Chain</option><option value="xstocks">xStocks / Arbitrum One</option></select></label><p className="cell-meta" role="status">{catalogError || (catalog ? catalog.complete ? "All discovered catalog pages loaded." : catalog.reason : "Loading xStocks. Robinhood research is available.")}</p>{catalogError || catalog && !catalog.complete ? <button className="filter-button" onClick={retryCatalog}>Retry xStocks catalog</button> : null}</div>
      <div className="toolbar"><label className="search-field"><Search size={15} aria-hidden="true" /><span className="sr-only">Search Stock Tokens</span><input value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Search symbol, issuer, or exact contract" /></label><div className="toolbar-right"><div className="filter-group" aria-label="Contract evidence filter">{([["all", "All"], ["verified", "Chain verified"], ["review", "Needs review"]] as [Filter, string][]).map(([value, label]) => <button key={value} className={`filter-button${filter === value ? " selected" : ""}`} type="button" aria-pressed={filter === value} onClick={() => changeFilter(value)}>{label}</button>)}</div></div></div>
      <div className="desk-controls"><div className="preset-group" role="group" aria-label="Column preset">{([["instrument", "Instrument"], ["market", "Market"], ["action", "Action"]] as [Preset, string][]).map(([value, label]) => <button key={value} className={`filter-button${preset === value ? " selected" : ""}`} type="button" aria-pressed={preset === value} onClick={() => changePreset(value)}>{label}</button>)}</div><label className="sort-field">Sort<select value={sort} onChange={(event) => changeSort(event.target.value as Sort)}>{sortOptions[preset].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="table-wrap"><table className={`market-table sourced-table sourced-${preset}`}><thead><tr><th>Instrument / market</th><th>{preset === "instrument" ? "Token address" : preset === "market" ? "Issuer reference" : "Identity evidence"}</th><th>{preset === "instrument" ? "Identity checks" : preset === "market" ? "Venue research" : "Action check"}</th><th>Your desk</th></tr></thead><tbody>{rows.slice(page * 25, (page + 1) * 25).map((asset) => {
        const identity = asset.sourced ? sourceValue(asset.sourced.identity) : null;
        const price = asset.sourced ? sourceValue(asset.sourced.price) : null;
        const assetHref = asset.issuer === "xstocks" ? `/xstocks/${asset.symbol}` : `/market/${asset.symbol.toLowerCase()}`;
        const market = asset.issuer === "xstocks" ? "xStocks / Arbitrum One / 42161" : "Robinhood / Robinhood Chain / 4663";
        return <tr key={`${asset.issuer}:${asset.chainId}:${asset.contract}:${asset.symbol}`} className="sourced-row">
          <td><Link className="asset-link" href={assetHref}><span className={`asset-avatar market-avatar market-${asset.issuer}`} aria-hidden="true">{asset.symbol[0]}</span><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span></Link><span className={`market-badge market-${asset.issuer}`}>{market}</span></td>
          <td>{preset === "market" ? <>{price ? <><strong className="numeric">${displayDecimal(price.bid, 2)} / ${displayDecimal(price.ask, 2)}</strong><span className="cell-meta">USD per underlying share</span></> : <span>Reference unavailable</span>}{asset.sourced ? <SourceLabel source={asset.sourced.price.source} /> : <span className="cell-meta">No reference feed connected for this listing.</span>}</> : <><code className="contract-value">{asset.contract || "Contract unavailable"}</code><span className="cell-meta">Exact contract / {asset.chainId}</span></>}</td>
          <td>{preset === "instrument" ? <><span className={`status-badge ${asset.verified ? "status-ready" : "status-review"}`}>{asset.verified ? "Identity verified" : "Needs review"}</span>{asset.sourced ? <SourceLabel source={asset.sourced.chain.source} /> : <span className="cell-meta">Issuer listing. Open research for onchain checks.</span>}</> : preset === "market" ? <>{asset.issuer === "robinhood" && identity && asset.verified ? <VenueSummary symbol={asset.symbol} /> : <span className="cell-meta">Verify pools on the asset page.</span>}<Link className="external-link" href={`${assetHref}#markets`}>Open markets <ArrowUpRight size={12} /></Link></> : <><Link className="external-link" href={`${assetHref}#action`}>Review action availability <ArrowUpRight size={12} /></Link><span className="cell-meta">Research does not authorize execution.</span></>}</td>
          <td>{asset.contract ? <WatchInstrument issuer={asset.issuer} chainId={asset.chainId} contract={asset.contract} symbol={asset.symbol} /> : <span className="cell-meta">Watchlist needs a contract</span>}<Link className="external-link" href={`/terminal?market=${state.market}&q=${encodeURIComponent(search)}&section=compare&assets=${asset.issuer}:${asset.symbol}#compare`}>Compare issuer</Link></td>
        </tr>;
      })}</tbody></table></div>
      {pages > 1 ? <nav className="compare-pages" aria-label="Market pages"><button disabled={page === 0} onClick={() => changePage(page - 1)}>Previous markets</button><span>Market page {page + 1} of {pages}</span><button disabled={page === pages - 1} onClick={() => changePage(page + 1)}>Next markets</button></nav> : null}
      {rows.length === 0 ? <div className="empty-state sourced-row"><strong>No matching instruments</strong><button type="button" className="filter-button" onClick={() => { searchEntry.current = false; updateDeskUrl({ search: "", filter: "all", preset, sort }, "push"); }}>Clear search and filters</button></div> : null}
      <div className="market-panel-foot"><span>{rows.length} results</span><span>Issuer prices are not size-aware venue quotes.</span></div>
    </section>
    <section className="evidence-method" id="methodology"><span className="section-kicker">METHOD</span><h2>How to use this desk</h2><p>Choose a market or search across both catalogs to open an exact token research page. Use Market to see issuer prices and trading pools, or Action to request an estimate for a specific amount. Each value has its own source and time.</p><p>Robinhood Stock Tokens provide economic exposure under issuer terms. They do not grant legal or beneficial ownership of the underlying shares.</p><a className="external-link" href="https://docs.robinhood.com/chain/stock-tokens/" target="_blank" rel="noopener noreferrer">Issuer product documentation <ArrowUpRight size={12} /></a></section>
  </main>;
}
