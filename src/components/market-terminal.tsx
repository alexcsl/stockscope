"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  ArrowUpRight,
  Database,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  formatCompactUsd,
  formatPercent,
  formatUsd,
  type Asset,
  type ReadinessStatus,
} from "@/lib/market-data";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";

type SortKey = "symbol" | "volume" | "depth" | "deviation";
type Filter = "all" | ReadinessStatus;

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All assets" },
  { value: "ready", label: "Ready" },
  { value: "review", label: "Review" },
  { value: "blocked", label: "Blocked" },
];

gsap.registerPlugin(useGSAP);

export function MarketTerminal({ assets }: { assets: Asset[] }) {
  const marketPanelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("volume");

  const visibleAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assets
      .filter((item) => {
        const matchesSearch =
          !normalized ||
          [item.symbol, item.name, item.underlyingSymbol]
            .join(" ")
            .toLowerCase()
            .includes(normalized);
        const matchesFilter =
          filter === "all" || item.readiness[0].status === filter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
        if (sort === "depth") return b.quote.depthUsd - a.quote.depthUsd;
        if (sort === "deviation")
          return (
            Math.abs(b.quote.deviationPercent) -
            Math.abs(a.quote.deviationPercent)
          );
        return b.quote.volume24hUsd - a.quote.volume24hUsd;
      });
  }, [assets, filter, query, sort]);

  const readyCount = assets.filter(
    (item) => item.readiness[0].status === "ready",
  ).length;
  const totalDepth = assets.reduce((sum, item) => sum + item.quote.depthUsd, 0);
  const resultKey = visibleAssets.map((item) => item.slug).join("|");

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const rows = marketPanelRef.current?.querySelectorAll(".market-table tbody tr");
      const target = rows?.length ? rows : marketPanelRef.current?.querySelectorAll(".empty-state");
      if (!target?.length) return;

      gsap.fromTo(
        target,
        { autoAlpha: 0.65, y: 4 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.16,
          stagger: 0.018,
          ease: "power1.out",
          clearProps: "opacity,visibility,transform",
        },
      );
    },
    { scope: marketPanelRef, dependencies: [resultKey], revertOnUpdate: true },
  );

  return (
    <>
      <section className="hero page-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" /> STOCK TOKEN DEMO
          </div>
          <h1 id="hero-title">
            Every token has a price.
            <br />
            <span>Know what it means.</span>
          </h1>
          <p>
            Research the stock, the token, and the market together. See how an
            xStock could be used before taking action.
          </p>
          <a className="hero-action" href="#market">
            Explore the market <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
        <div className="hero-visual" aria-label="Illustrative StockScope analysis">
          <div className="visual-topline">
            <span className="visual-kicker">ASSET INTELLIGENCE</span>
            <span className="visual-live">DEMO SNAPSHOT</span>
          </div>
          <div className="visual-symbol">
            <span className="visual-token">N</span>
            <span>
              <strong>NVDAx</strong>
              <small>NVIDIA xStock</small>
            </span>
            <span className="visual-price">$185.62</span>
          </div>
          <div className="visual-chart" aria-hidden="true">
            <div className="chart-grid" />
            <svg viewBox="0 0 420 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#b8e970" stopOpacity=".24" />
                  <stop offset="100%" stopColor="#b8e970" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 80 L30 73 L60 78 L90 54 L120 61 L150 47 L180 55 L210 36 L240 39 L270 28 L300 37 L330 18 L360 23 L390 14 L420 18 L420 100 L0 100 Z"
                fill="url(#chart-fill)"
              />
              <path
                d="M0 80 L30 73 L60 78 L90 54 L120 61 L150 47 L180 55 L210 36 L240 39 L270 28 L300 37 L330 18 L360 23 L390 14 L420 18"
                fill="none"
                stroke="#b8e970"
                strokeWidth="2.5"
              />
            </svg>
          </div>
          <div className="visual-metrics">
            <div>
              <span>Reference</span>
              <strong>$185.18</strong>
            </div>
            <div>
              <span>Deviation</span>
              <strong>+0.24%</strong>
            </div>
            <div>
              <span>Spot trade</span>
              <StatusBadge status="ready" />
            </div>
          </div>
          <div className="visual-footer">
            <span>Illustrative values only</span>
            <span>Source: local demo fixture</span>
          </div>
        </div>
      </section>

      <main className="page-shell main-content" id="market">
        <div className="demo-banner" role="note">
          <Database size={17} aria-hidden="true" />
          <span>
            <strong>Demo data</strong> Prices, depth, volume, charts, and
            readiness states in this market overview are illustrative. No venue feeds or
            execution routes are connected.
          </span>
        </div>

        <section className="market-section" aria-labelledby="market-title">
          <div className="section-header">
            <div>
              <div className="section-kicker">MARKET OVERVIEW</div>
              <h2 id="market-title">Explore xStocks</h2>
              <p>Issuer context and onchain market signals in one view.</p>
            </div>
            <span className="snapshot-pill">LOCAL DEMO SNAPSHOT</span>
          </div>

          <div className="stats-grid" aria-label="Illustrative market summary">
            <div className="stat-card">
              <span>Assets tracked</span>
              <strong>{assets.length.toString().padStart(2, "0")}</strong>
              <small>Sample universe</small>
            </div>
            <div className="stat-card">
              <span>Sample spot ready</span>
              <strong>{readyCount.toString().padStart(2, "0")}</strong>
              <small>At $10,000 trade size</small>
            </div>
            <div className="stat-card">
              <span>Sample venue depth</span>
              <strong>{formatCompactUsd(totalDepth)}</strong>
              <small>Sum of illustrative quotes</small>
            </div>
            <div className="stat-card stat-card-accent">
              <span>Data mode</span>
              <strong>DEMO</strong>
              <small>Live connections planned</small>
            </div>
          </div>

          <div className="market-panel" ref={marketPanelRef}>
            <div className="market-panel-top">
              <div>
                <h3>Market universe</h3>
                <p>Compare token and underlying context</p>
              </div>
              <div className="panel-count">{visibleAssets.length} ASSETS</div>
            </div>
            <div className="toolbar">
              <label className="search-field">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">Search assets</span>
                <input
                  type="search"
                  placeholder="Search asset or symbol"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="toolbar-right">
                <div className="filter-group" aria-label="Filter sample spot readiness">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  {filters.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`filter-button ${filter === item.value ? "selected" : ""}`}
                      aria-pressed={filter === item.value}
                      onClick={() => setFilter(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className="sort-field">
                  <span>Sort</span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    aria-label="Sort assets"
                  >
                    <option value="volume">Volume</option>
                    <option value="depth">Depth</option>
                    <option value="deviation">Deviation</option>
                    <option value="symbol">Symbol</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="table-wrap">
              <table className="market-table">
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Token price</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Deviation</th>
                    <th scope="col">24h volume</th>
                    <th scope="col">Venue depth</th>
                    <th scope="col">$10k impact</th>
                    <th scope="col">Trend</th>
                    <th scope="col">Spot readiness</th>
                    <th scope="col"><span className="sr-only">Open asset</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAssets.map((item) => (
                    <tr key={item.slug}>
                      <td>
                        <Link className="asset-link" href={`/assets/${item.slug}`}>
                          <span
                            className="asset-avatar"
                            style={{ "--asset-accent": item.accent } as React.CSSProperties}
                            aria-hidden="true"
                          >
                            {item.underlyingSymbol.slice(0, 1)}
                          </span>
                          <span>
                            <strong>{item.symbol}</strong>
                            <small>{item.name}</small>
                          </span>
                        </Link>
                      </td>
                      <td className="numeric strong-value">
                        {formatUsd(item.quote.tokenPriceUsd)}
                      </td>
                      <td className="numeric muted-value">
                        {formatUsd(item.quote.referencePriceUsd)}
                      </td>
                      <td className={`numeric ${item.quote.deviationPercent < 0 ? "negative" : "positive"}`}>
                        {formatPercent(item.quote.deviationPercent)}
                      </td>
                      <td className="numeric">{formatCompactUsd(item.quote.volume24hUsd)}</td>
                      <td className="numeric">{formatCompactUsd(item.quote.depthUsd)}</td>
                      <td className="numeric">{item.quote.estimatedImpactPercent.toFixed(2)}%</td>
                      <td><Sparkline values={item.sparkline} color={item.accent} label={item.symbol} /></td>
                      <td><StatusBadge status={item.readiness[0].status} /></td>
                      <td>
                        <Link className="row-arrow" href={`/assets/${item.slug}`} aria-label={`View ${item.symbol} details`}>
                          <span>View asset</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleAssets.length === 0 && (
                <div className="empty-state">
                  <Search size={22} aria-hidden="true" />
                  <strong>No matching assets</strong>
                  <span>Try a different search or readiness filter.</span>
                </div>
              )}
            </div>
            <div className="market-panel-foot">
              <span>Quotes and readiness: local demo fixture, 25 Sep 2026</span>
              <span>Trade size: $10,000 per asset</span>
            </div>
          </div>
        </section>

        <section className="method-section" id="methodology" aria-labelledby="method-title">
          <div>
            <div className="section-kicker">HOW TO READ STOCKSCOPE</div>
            <h2 id="method-title">Context before conviction.</h2>
          </div>
          <div className="method-grid">
            <div>
              <span className="method-number">01 /</span>
              <h3>Market</h3>
              <p>Compare a token quote with its underlying reference and the depth available at a chosen venue.</p>
            </div>
            <div>
              <span className="method-number">02 /</span>
              <h3>Issuer</h3>
              <p>Identify the product, its stated terms, and the source behind each claim.</p>
            </div>
            <div>
              <span className="method-number">03 /</span>
              <h3>Action</h3>
              <p>Inspect checks for a particular action, size, and integration. Demo statuses are not live approvals.</p>
            </div>
          </div>
          <Link className="method-link" href={`/assets/${assets[0].slug}`}>
            Open a sample asset <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </main>
    </>
  );
}
