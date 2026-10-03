import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { InstrumentHeading, InstrumentSections } from "@/components/instrument-heading";
import { WatchInstrument } from "@/components/watch-instrument";
import { SiteHeader } from "@/components/site-header";
import { PageLoading } from "@/components/page-loading";
import { TokenCandles } from "@/components/token-candles";
import { VenueMarket } from "@/components/venue-market";
import { InfoTip } from "@/components/info-tip";
import { getXStock } from "@/lib/xstocks-catalog";
async function XStockEvidence({ symbol }: { symbol: string }) {
  await connection();
  const asset = await getXStock(symbol);
  return <section className="detail-card"><div className="card-header"><h3>Asset passport</h3><span className={`status-badge ${asset?.state === "verified" ? "status-ready" : "status-review"}`}>{asset?.state === "verified" ? "Identity verified" : "Unavailable / needs review"}</span></div><dl className="evidence-facts"><div><dt>Issuer</dt><dd>Backed Assets (JE) Limited / xStocks</dd></div><div><dt>ISIN</dt><dd>{asset?.isin || "Unpublished"}</dd></div><div><dt>Name</dt><dd>{asset?.name || symbol}</dd></div><div><dt>Chain</dt><dd>Arbitrum One / 42161</dd></div><div><dt>Shares per token <InfoTip label="Multiplier">Issuer conversion between token units and underlying share units. Candles remain USD per token and do not apply this conversion again.</InfoTip></dt><dd>{asset?.state === "verified" ? asset.multiplier : "Unverified"}</dd></div><div><dt>Token address</dt><dd><code className="contract-value">{asset?.contract || "Unverified"}</code></dd></div></dl>{asset?.reason ? <p className="workflow-message">{asset.reason.replaceAll("_", " ")}</p> : null}{asset?.contract ? <WatchInstrument issuer="xstocks" chainId={42161} contract={asset.contract} symbol={symbol} /> : null}<p className="cell-meta">xStocks issuer listing and onchain unit checks. The current multiplier is checked independently from chart sourcing.</p><div className="workflow-actions"><a href={`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}`} target="_blank" rel="noopener noreferrer">Issuer record</a><a href="https://docs.xstocks.fi/docs/product-legal-overview" target="_blank" rel="noopener noreferrer">xStocks terms</a></div></section>;
}
export default async function XStockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const raw = (await params).symbol;
  if (!/^[A-Za-z0-9]{1,15}x$/i.test(raw)) notFound();
  const symbol = `${raw.slice(0, -1).toUpperCase()}x`;
  return <><SiteHeader market="xstocks" /><main className="page-shell detail-main">
    <InstrumentHeading symbol={symbol} name="Backed xStocks / tokenized stock research" issuer="xstocks" />
    <div className="data-notice"><strong>xStocks / Arbitrum One / 42161</strong><span>Issuer facts, pool observations, and action availability are checked separately. Catalog inclusion does not verify a contract or establish trading eligibility.</span></div>
    <InstrumentSections />
    <div className="detail-grid"><div className="detail-primary">
      <section className="asset-section" id="overview"><h2 className="asset-section-title">Overview</h2><section className="detail-card"><div className="card-header"><h3>Issuer reference</h3><span className="card-tag">UNAVAILABLE</span></div><p className="card-intro">No issuer bid or ask feed is connected for this instrument. The chart below shows indexed token trades when its exact pool can be verified.</p><dl className="evidence-facts"><div><dt>Market</dt><dd>xStocks / Arbitrum One / 42161</dd></div><div><dt>Reference price</dt><dd>Unavailable</dd></div><div><dt>Redemption and eligibility</dt><dd>Check the instrument&apos;s issuer terms</dd></div></dl></section></section>
      <section className="asset-section" id="markets"><h2 className="asset-section-title">Markets</h2><TokenCandles symbol={symbol} issuer="xstocks" /><VenueMarket symbol={symbol} issuer="xstocks" /></section>
      <section className="asset-section" id="events"><h2 className="asset-section-title">Events</h2><section className="detail-card"><h3>Corporate actions</h3><span className="card-tag">FEED UNAVAILABLE</span><p>No verified event feed is connected for this xStock. An unavailable feed does not mean there are no corporate actions.</p><a className="external-link" href="https://docs.xstocks.fi/" target="_blank" rel="noopener noreferrer">Review issuer documentation</a></section></section>
      <section className="asset-section" id="research-agent"><h2 className="asset-section-title">Research</h2><section className="detail-card"><h3>Your evidence desk</h3><p>Watch this exact contract, compare issuers, and refresh pool evidence from your terminal. Alerts are checked on refresh in this browser. Automated asset briefings are currently unavailable for xStocks.</p><Link className="external-link" href={`/terminal?market=xstocks#research`}>Open your research desk</Link></section></section>
      <section className="asset-section" id="action"><h2 className="asset-section-title">Action</h2><section className="detail-card"><h3>Swap availability</h3><span className="card-tag">EXECUTION UNAVAILABLE</span><p>Wallet signing for xStocks on Arbitrum One is unavailable. Venue liquidity and chart availability do not authorize a swap. The execution lab uses separate testnet tokens.</p><Link className="external-link" href={`/robinhood?market=xstocks&symbol=${symbol}`}>Review swap availability</Link></section></section>
    </div><aside className="detail-sidebar"><section className="asset-section" id="issuer"><h2 className="asset-section-title">Issuer</h2><Suspense fallback={<PageLoading title="Checking token identity" />}><XStockEvidence symbol={symbol} /></Suspense></section><section className="detail-card"><h3>Integrations</h3><dl className="passport-list"><div><dt>TradingView chart renderer</dt><dd>Integrated / data availability varies</dd></div><div><dt>Indexed pools</dt><dd>See exact verified venues in Markets</dd></div><div><dt>Uniswap swap execution</dt><dd>Unavailable for this instrument</dd></div><div><dt>Collateral integrations</dt><dd>Unverified</dd></div></dl></section></aside></div>
  </main><footer className="site-footer page-shell"><span>StockScope / Research before action</span><span>xStocks / Arbitrum One</span></footer></>;
}
