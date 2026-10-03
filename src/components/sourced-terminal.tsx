"use client";

import Link from "next/link";
import { useCallback, useRef, useSyncExternalStore } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Search, ArrowUpRight } from "lucide-react";
import type { SourcedAsset } from "@/lib/robinhood-data";
import { displayDecimal, sourceValue } from "@/lib/observations";
import { InfoTip } from "./info-tip";
import { SourceLabel } from "./source-label";
import { VenueSummary } from "./venue-market";

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
    search: params.get("q") || "",
    filter: filter === "verified" || filter === "review" ? filter : "all" as Filter,
    preset: preset === "market" || preset === "action" ? preset : "instrument" as Preset,
    sort: sort || "",
  };
}

function updateDeskUrl(state: { search: string; filter: Filter; preset: Preset; sort: Sort }, historyMode: "push" | "replace") {
  const url = new URL(window.location.href);
  for (const [key, value] of [["q", state.search], ["filter", state.filter], ["view", state.preset], ["sort", state.sort]] as const) {
    if (value && value !== "all" && value !== "instrument" && value !== "symbol") url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history[historyMode === "push" ? "pushState" : "replaceState"]({}, "", url);
  window.dispatchEvent(new Event("stockscope:deskchange"));
}

export function SourcedTerminal({ assets }: { assets: SourcedAsset[] }) {
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
  const query = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const state = readDeskState(query);
  const { search, filter, preset } = state;
  const availableSorts: Record<Preset, Sort[]> = { instrument: ["symbol", "name", "contract"], market: ["reference", "symbol"], action: ["identity", "symbol"] };
  const defaultSort: Sort = preset === "market" ? "reference" : preset === "action" ? "identity" : "symbol";
  const sort = availableSorts[preset].includes(state.sort as Sort) ? state.sort as Sort : defaultSort;

  const rows = assets.filter((asset) => {
    const identity = sourceValue(asset.identity);
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [asset.symbol, identity?.name || "", identity?.contract || ""].some((value) => value.toLowerCase().includes(needle));
    const matchesFilter = filter === "all" || (filter === "verified" ? asset.chain.state === "available" : asset.chain.state !== "available");
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sort === "name") return (sourceValue(a.identity)?.name || "￿").localeCompare(sourceValue(b.identity)?.name || "￿") || a.symbol.localeCompare(b.symbol);
    if (sort === "contract") return (sourceValue(a.identity)?.contract || "￿").localeCompare(sourceValue(b.identity)?.contract || "￿") || a.symbol.localeCompare(b.symbol);
    if (sort === "reference") return (a.price.state === "available" ? 0 : 1) - (b.price.state === "available" ? 0 : 1) || a.symbol.localeCompare(b.symbol);
    if (sort === "identity") return (a.chain.state === "available" ? 0 : 1) - (b.chain.state === "available" ? 0 : 1) || a.symbol.localeCompare(b.symbol);
    return a.symbol.localeCompare(b.symbol);
  });

  const changeSearch = (value: string) => {
    updateDeskUrl({ search: value, filter, preset, sort }, searchEntry.current ? "replace" : "push");
    searchEntry.current = value.length > 0;
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
    <div className="desk-heading"><div><span className="section-kicker">ROBINHOOD CHAIN / SOURCED RESEARCH</span><h1>Stock Tokens</h1><p>Issuer facts, market references, and the evidence behind a specific action.</p></div><div className="desk-links"><a className="external-link" href="#research">Your desk <ArrowUpRight size={14} /></a><Link className="external-link" href="/compare">Compare issuers <ArrowUpRight size={14} /></Link><Link className="external-link" href="/demo">Browse the demo <ArrowUpRight size={14} /></Link></div></div>
    <div className="data-notice"><strong>Source-backed observations</strong><span>References are issuer-reported. Venue quotes require a separate request. Missing depth, volume, and collateral evidence remain unavailable.</span></div>
    <div className="desk-summary" aria-label="Research coverage"><div><span>Tokens tracked</span><strong>{assets.length}</strong><small>Exact issuer instruments</small></div><div><span>Identity verified</span><strong>{assets.filter((asset) => asset.chain.state === "available").length}</strong><small>Token and chain agree</small></div><div><span>Issuer prices available</span><strong>{assets.filter((asset) => asset.price.state === "available").length}</strong><small>Reference prices, not trade quotes</small></div><div><span>Needs identity review</span><strong>{assets.filter((asset) => asset.chain.state !== "available").length}</strong><small>Open the record to inspect sources</small></div></div>
    <section className="market-panel" id="market" aria-label="Stock Token market">
      <div className="market-panel-top"><div><h2>Market desk</h2><p>Robinhood Chain · 4663 · Three tracked instruments</p></div><span className="card-tag">SOURCED</span></div>
      <div className="toolbar"><label className="search-field"><Search size={15} aria-hidden="true" /><span className="sr-only">Search Stock Tokens</span><input value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Search symbol, issuer, or exact contract" /></label><div className="toolbar-right"><div className="filter-group" aria-label="Contract evidence filter">{([["all", "All"], ["verified", "Chain verified"], ["review", "Needs review"]] as [Filter, string][]).map(([value, label]) => <button key={value} className={`filter-button${filter === value ? " selected" : ""}`} type="button" aria-pressed={filter === value} onClick={() => changeFilter(value)}>{label}</button>)}</div></div></div>
      <div className="desk-controls"><div className="preset-group" role="group" aria-label="Column preset">{([["instrument", "Instrument"], ["market", "Market"], ["action", "Action"]] as [Preset, string][]).map(([value, label]) => <button key={value} className={`filter-button${preset === value ? " selected" : ""}`} type="button" aria-pressed={preset === value} onClick={() => changePreset(value)}>{label}</button>)}</div><label className="sort-field">Sort<select value={sort} onChange={(event) => changeSort(event.target.value as Sort)}>{sortOptions[preset].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="table-wrap"><table className={`market-table sourced-table sourced-${preset}`}><thead><tr><th>Instrument</th>{preset === "instrument" ? <><th>Token address <InfoTip label="Token address">A token is identified by its blockchain and contract address. A matching ticker alone is not enough.</InfoTip></th><th>Identity checks <InfoTip label="Identity checks">The listed issuer contract is checked on its named blockchain. This verifies the token identity, not its value or trade eligibility.</InfoTip></th></> : null}{preset === "market" ? <><th>Issuer reference <InfoTip label="Issuer reference">The issuer reports a share price. This is not the price a token trade will receive. Bid is the buying offer; ask is the selling offer.</InfoTip></th><th>Verified venue</th></> : null}{preset === "action" ? <><th>Identity evidence</th><th>Action check</th></> : null}</tr></thead><tbody>{rows.map((asset) => {
        const identity = sourceValue(asset.identity);
        const price = sourceValue(asset.price);
        const assetHref = `/market/${asset.symbol.toLowerCase()}`;
        return <tr key={asset.symbol} className="sourced-row"><td><Link className="asset-link" href={assetHref}><span><strong>{asset.symbol}</strong><small>{identity?.name || "Issuer identity unavailable"}</small></span></Link><span className="cell-meta">Robinhood Stock Token · Chain 4663</span><span className="cell-meta">{asset.identity.state === "available" ? "Token listed" : "Identity needs review"} / {asset.price.state === "available" ? "Price available" : asset.price.state === "stale" ? "Price stale" : "Price unavailable"}</span></td>{preset === "instrument" ? <><td>{identity ? <><code className="contract-value" title={identity.contract}>{identity.contract}</code><span className="cell-meta">Exact contract · {identity.chainId}</span></> : <span>Contract unavailable</span>}</td><td><span className={`status-badge ${asset.chain.state === "available" ? "status-ready" : "status-review"}`}>{asset.chain.state === "available" ? "Identity verified" : "Review"}</span><SourceLabel source={asset.chain.source} /></td></> : null}{preset === "market" ? <><td>{price ? <><strong className="numeric">${displayDecimal(price.bid, 2)} / ${displayDecimal(price.ask, 2)}</strong><span className="cell-meta">USD per underlying share · {asset.price.state}</span></> : <span>Reference unavailable · {asset.price.state}</span>}<SourceLabel source={asset.price.source} /></td><td>{identity && asset.chain.state === "available" ? <VenueSummary symbol={asset.symbol} /> : <span>Venue unavailable · identity not verified</span>}<Link className="external-link" href={assetHref}>Compare buy and sell sizes <ArrowUpRight size={12} /></Link></td></> : null}{preset === "action" ? <><td><span className={`status-badge ${asset.chain.state === "available" ? "status-ready" : "status-review"}`}>{asset.chain.state === "available" ? "Identity verified" : "Review"}</span><span className="cell-meta">{identity?.contract || "Contract unavailable"}</span><SourceLabel source={asset.chain.source} /></td><td><Link className="external-link" href={assetHref}>Set amount and review checks <ArrowUpRight size={12} /></Link><span className="cell-meta">No action status until the named route is checked.</span></td></> : null}</tr>;
      })}</tbody></table></div>
      {rows.length === 0 ? <div className="empty-state sourced-row"><strong>No matching instruments</strong><button type="button" className="filter-button" onClick={() => { searchEntry.current = false; updateDeskUrl({ search: "", filter: "all", preset, sort }, "push"); }}>Clear search and filters</button></div> : null}
      <div className="market-panel-foot"><span>{rows.length} results</span><span>Issuer prices are not size-aware venue quotes.</span></div>
    </section>
    <section className="evidence-method" id="methodology"><span className="section-kicker">METHOD</span><h2>How to use this desk</h2><p>Choose a token to open its research page. Use Market to see issuer prices and trading pools, or Action to request an estimate for a specific amount. Each value has its own source and time.</p><p>Robinhood Stock Tokens provide economic exposure under issuer terms. They do not grant legal or beneficial ownership of the underlying shares.</p><a className="external-link" href="https://docs.robinhood.com/chain/stock-tokens/" target="_blank" rel="noopener noreferrer">Issuer product documentation <ArrowUpRight size={12} /></a></section>
  </main>;
}
