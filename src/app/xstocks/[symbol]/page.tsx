import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { PageLoading } from "@/components/page-loading";
import { TokenCandles } from "@/components/token-candles";
import { VenueMarket } from "@/components/venue-market";
import { InfoTip } from "@/components/info-tip";
import { getXStock } from "@/lib/xstocks-catalog";
async function XStockEvidence({ symbol }: { symbol: string }) {
  await connection();
  const asset = await getXStock(symbol);
  return <section className="detail-card"><div className="card-header"><h2>Issuer and token identity</h2><span className={`status-badge ${asset?.state === "verified" ? "status-ready" : "status-review"}`}>{asset?.state === "verified" ? "Identity verified" : "Unavailable / needs review"}</span></div><dl className="evidence-facts"><div><dt>Name</dt><dd>{asset?.name || symbol}</dd></div><div><dt>Chain</dt><dd>Arbitrum One / 42161</dd></div><div><dt>Shares per token <InfoTip label="Multiplier">Issuer conversion between token units and underlying share units. Candles remain USD per token and do not apply this conversion again.</InfoTip></dt><dd>{asset?.state === "verified" ? asset.multiplier : "Unverified"}</dd></div><div><dt>Token address</dt><dd><code className="contract-value">{asset?.contract || "Unverified"}</code></dd></div></dl>{asset?.reason ? <p className="workflow-message">{asset.reason.replaceAll("_", " ")}</p> : null}<p className="cell-meta">xStocks issuer listing and onchain unit checks. The current multiplier is checked independently from chart sourcing.</p><div className="workflow-actions"><a href={`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}`} target="_blank" rel="noopener noreferrer">Issuer record</a><a href="https://docs.xstocks.fi/docs/product-legal-overview" target="_blank" rel="noopener noreferrer">xStocks terms</a></div></section>;
}
export default async function XStockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  if (!/^[A-Za-z0-9]{1,15}x$/.test(symbol)) notFound();
  return <><SiteHeader /><main className="page-shell detail-main"><Link className="back-link" href="/compare">Back to comparison</Link><div className="desk-heading"><div><span className="section-kicker">XSTOCKS / ARBITRUM ONE</span><h1>{symbol}</h1><p>Exact token market research. Issuer terms and source availability are shown independently.</p></div></div><div className="data-notice"><strong>Research only</strong><span>These are Arbitrum One observations. The testnet lab uses separate demo tokens on Arbitrum Sepolia.</span></div><TokenCandles symbol={symbol} /><VenueMarket symbol={symbol} issuer="xstocks" /><Suspense fallback={<PageLoading title="Checking token identity" />}><XStockEvidence symbol={symbol} /></Suspense></main></>;
}
