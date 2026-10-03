import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SourceLabel } from "@/components/source-label";
import { TradeWorkspace } from "@/components/trade-workspace";
import { ResearchAgent } from "@/components/research-agent";
import { QuoteComparison } from "@/components/quote-comparison";
import { VenueMarket } from "@/components/venue-market";
import { TokenCandles } from "@/components/token-candles";
import { EventTimeline } from "@/components/event-timeline";
import { EvidenceGuide } from "@/components/evidence-guide";
import { getSourcedAsset, robinhoodSymbols } from "@/lib/robinhood-data";
import { displayDecimal, sourceValue } from "@/lib/observations";
import { instrumentKey } from "@/lib/research-state";

async function MarketAssetData({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol.toUpperCase();
  if (!(robinhoodSymbols as readonly string[]).includes(symbol)) notFound();
  await connection();
  const asset = await getSourcedAsset(symbol);
  const identity = sourceValue(asset.identity);
  const price = sourceValue(asset.price);
  const chain = sourceValue(asset.chain);
  return <><main className="page-shell detail-main"><Link className="back-link" href="/terminal">Back to sourced market</Link><div className="desk-heading"><div><span className="section-kicker">ROBINHOOD CHAIN / STOCK TOKEN</span><h1>{symbol}</h1><p>{identity?.name || "Issuer identity unavailable"}</p></div><span className="card-tag">SOURCED RECORD</span></div><div className="data-notice"><strong>Independent source states</strong><span>Issuer references are not venue prices. Quote availability is not execution approval. Collateral support remains unverified.</span></div>
    <nav className="asset-section-nav" aria-label="Asset sections">{[["overview", "Overview"], ["markets", "Markets"], ["issuer", "Issuer"], ["events", "Events"], ["research-agent", "Research"], ["action", "Action"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    <div className="detail-grid"><div className="detail-primary">
      <section className="asset-section" id="overview" aria-labelledby="overview-title"><h2 className="asset-section-title" id="overview-title">Overview</h2><section className="detail-card"><div className="card-header"><h3>Issuer reference</h3><span className="card-tag">{asset.price.state.toUpperCase()}</span></div>{price ? <><dl className="evidence-facts"><div><dt>Underlying share bid / ask</dt><dd>${displayDecimal(price.bid, 4)} / ${displayDecimal(price.ask, 4)}</dd></div><div><dt>Token-equivalent reference bid / ask</dt><dd>${displayDecimal(price.tokenBid, 6)} / ${displayDecimal(price.tokenAsk, 6)}</dd></div><div><dt>Conversion</dt><dd>Underlying price × issuer multiplier; applied once</dd></div><div><dt>Issuer-reported halt</dt><dd>{price.halted ? "Halted" : "No halt reported"}</dd></div></dl><p className="cell-meta">Token-equivalent references are derived issuer values, not venue quotes. Session comparability is unverified; deviation is unavailable.</p></> : <p className="workflow-message">Price unavailable. No fixture fallback is used.</p>}<SourceLabel source={asset.price.source} /></section><EvidenceGuide asset={asset} /></section>
      <section className="asset-section" id="markets" aria-labelledby="markets-title"><h2 className="asset-section-title" id="markets-title">Markets</h2><TokenCandles symbol={symbol} issuer="robinhood" /><VenueMarket symbol={symbol} /><QuoteComparison symbol={symbol} /></section>
      <section className="asset-section" id="events" aria-labelledby="events-title"><h2 className="asset-section-title" id="events-title">Events</h2><EventTimeline asset={asset} /></section>
      {identity ? <ResearchAgent key={instrumentKey("robinhood", 4663, identity.contract)} symbol={symbol} assetKey={instrumentKey("robinhood", 4663, identity.contract)} /> : <section className="asset-section" id="research-agent"><h2 className="asset-section-title">Evidence desk</h2><div className="detail-card"><h3>Briefing unavailable</h3><p>The issuer token identity could not be verified. Reload to retry the source before creating a briefing for this exact instrument.</p></div></section>}
      <section className="asset-section" id="action" aria-labelledby="action-title"><h2 className="asset-section-title" id="action-title">Action</h2><p className="card-intro">Set the intended amount and inspect current policy evidence. A research quote alone cannot approve execution.</p><TradeWorkspace symbol={symbol} /></section>
    </div><aside className="detail-sidebar"><section className="asset-section" id="issuer" aria-labelledby="issuer-title"><h2 className="asset-section-title" id="issuer-title">Issuer</h2><section className="detail-card"><h3>Asset passport</h3><dl className="passport-list"><div><dt>Issuer</dt><dd>Robinhood Assets (Jersey) Limited</dd></div><div><dt>Chain</dt><dd>Robinhood Chain · 4663</dd></div><div><dt>Contract</dt><dd>{identity?.contract || "Unverified"}</dd></div><div><dt>ISIN</dt><dd>{identity?.isin || "Unpublished"}</dd></div><div><dt>Multiplier</dt><dd>{identity?.multiplier || "Unavailable"}</dd></div><div><dt>Pending multiplier</dt><dd>{identity ? identity.pendingMultiplier || "None reported" : "Unknown"}</dd></div><div><dt>Onchain verification</dt><dd>{asset.chain.state}</dd></div><div><dt>Block</dt><dd>{chain?.block || "Unavailable"}</dd></div><div><dt>Oracle pause</dt><dd>{chain ? chain.oraclePaused ? "Paused" : "Not paused" : "Unknown"}</dd></div><div><dt>Oracle price / feed</dt><dd>Requires verified execution manifest</dd></div><div><dt>Pool activity / depth</dt><dd>See Markets; executable depth unverified</dd></div><div><dt>Collateral eligibility</dt><dd>Unverified</dd></div></dl><p className="passport-note">Stock Tokens are issuer-defined debt securities providing economic exposure, with no ownership rights in the underlying shares. Asset-specific Final Terms and eligibility must be checked.</p><SourceLabel source={asset.identity.source} /><SourceLabel source={asset.chain.source} /><div className="workflow-actions"><a href="https://docs.robinhood.com/chain/stock-tokens/" target="_blank" rel="noopener noreferrer">Issuer terms and product context</a><a href="https://docs.robinhood.com/chain/oracles-and-price-feeds/" target="_blank" rel="noopener noreferrer">Oracle documentation</a></div></section></section></aside></div></main></>;
}

export default function MarketAssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  return <><SiteHeader /><Suspense fallback={<main className="page-shell"><PageLoading title="Asset research" /></main>}><MarketAssetData params={params} /></Suspense></>;
}
