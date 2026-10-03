import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, Database, Info, Minus, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { TokenCandles } from "@/components/token-candles";
import { StatusBadge } from "@/components/status-badge";
import { IssuerPilotPanel } from "@/components/issuer-pilot-panel";
import { IndicativeRoutePanel } from "@/components/indicative-route-panel";
import { getIssuerPilot } from "@/lib/issuer-data";
import {
  demoMarketDataProvider,
        type CheckStatus,
} from "@/lib/market-data";

const issuerDocs = "https://docs.xstocks.fi/docs/how-xstocks-work";
const issuerLegalDocs = "https://docs.xstocks.fi/docs/product-legal-overview";

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <Check size={14} aria-hidden="true" />;
  if (status === "fail") return <X size={14} aria-hidden="true" />;
  return <Minus size={14} aria-hidden="true" />;
}

export async function generateStaticParams() {
  const assets = await demoMarketDataProvider.listAssets();
  return assets.map((asset) => ({ slug: asset.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const asset = await demoMarketDataProvider.getAsset(slug);
  return {
    title: asset ? `${asset.symbol} | StockScope` : "Asset not found | StockScope",
    description: asset
      ? slug === "nvdax"
        ? "Issuer API record and illustrative market and action research for NVDAx."
        : `Illustrative market and action research for ${asset.symbol}. Demo data only.`
      : "Asset not found.",
  };
}

export default async function AssetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const asset = await demoMarketDataProvider.getAsset(slug);
  if (!asset) notFound();
  if (slug === "nvdax") await connection();
  const issuerPilot = slug === "nvdax" ? await getIssuerPilot() : null;

  return (
    <>
      <SiteHeader />
      <main className="page-shell detail-main">
        <Link className="back-link" href="/demo#market"><ArrowLeft size={15} aria-hidden="true" /> Back to demo market</Link>
        <div className="demo-banner detail-demo" role="note">
          <Database size={17} aria-hidden="true" />
          <span><strong>Demo market data</strong> The candlestick panel uses independently verified Arbitrum market sources when available. Actions, events, and integration examples below remain demo data. {issuerPilot ? "The issuer record and route check are separate source panels. " : ""}No trades can be submitted.</span>
        </div>

        <section className="detail-heading" aria-labelledby="asset-title">
          <div className="detail-identity">
            <span className="asset-avatar detail-avatar" style={{ "--asset-accent": asset.accent } as React.CSSProperties} aria-hidden="true">
              {asset.underlyingSymbol.slice(0, 1)}
            </span>
            <div>
              <div className="section-kicker">TOKEN RESEARCH / DEMO EXAMPLES</div>
              <h1 id="asset-title">{asset.symbol}</h1>
              <p>{asset.name} <span className="identity-separator">/</span> {asset.assetClass}</p>
            </div>
          </div>
        </section>

        {issuerPilot && <IssuerPilotPanel pilot={issuerPilot} />}
        {issuerPilot && <IndicativeRoutePanel tokenAddress={issuerPilot.identity?.contractAddress} usdcAddress={issuerPilot.identity?.usdcAddress} />}

        <div className="detail-grid">
          <div className="detail-primary">
            <TokenCandles symbol={asset.symbol} />

            <section className="detail-card" aria-labelledby="readiness-title">
              <div className="card-header">
                <div><span className="section-kicker">02 / ACTION</span><h2 id="readiness-title">Sample action readiness</h2></div>
                <span className="card-tag">ILLUSTRATIVE</span>
              </div>
              <p className="card-intro">A status applies to one action and context. These example decisions cannot authorize an actual transaction.</p>
              <div className="readiness-list">
                {asset.readiness.map((item) => (
                  <div className="readiness-item" key={item.action}>
                    <div className="readiness-top">
                      <div><strong>{item.action}</strong><span>{item.context}</span></div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="check-list">
                      {item.checks.map((check) => (
                        <div className="check-row" key={check.name}>
                          <span className={`check-icon check-${check.status}`}><CheckIcon status={check.status} /></span>
                          <span><strong>{check.name}</strong><small>{check.detail}</small></span>
                          <span className="check-source">DEMO</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-card" aria-labelledby="event-title">
              <div className="card-header">
                <div><span className="section-kicker">03 / EVENTS</span><h2 id="event-title">Corporate actions</h2></div>
                <span className="card-tag">NO LIVE FEED</span>
              </div>
              {asset.corporateActions.map((event) => (
                <div className="event-item" key={event.id}>
                  <span className="event-marker" aria-hidden="true" />
                  <div><strong>{event.title}</strong><p>{event.detail}</p><small>{event.status} / {event.source.label}</small></div>
                </div>
              ))}
            </section>
          </div>

          <aside className="detail-sidebar" aria-label="Asset passport and integrations">
            <section className="detail-card" aria-labelledby="passport-title">
              <div className="card-header">
                <div><span className="section-kicker">ASSET PASSPORT</span><h2 id="passport-title">The token</h2></div>
                <Info size={17} aria-hidden="true" />
              </div>
              <dl className="passport-list">
                <div><dt>Underlying</dt><dd>{asset.underlyingSymbol}</dd></div>
                <div><dt>Issuer</dt><dd>{issuerPilot?.identity ? <a className="contract-link" href={issuerLegalDocs} target="_blank" rel="noopener noreferrer">Backed Assets (JE) Limited <ArrowUpRight size={12} aria-hidden="true" /></a> : asset.issuer}</dd></div>
                <div><dt>Chain</dt><dd>{issuerPilot?.identity ? "Arbitrum (issuer API)" : asset.chain}</dd></div>
                <div><dt>Token contract</dt><dd className={issuerPilot?.identity ? "" : "unknown-value"}>{issuerPilot?.identity ? <a className="contract-link" href={`https://arbiscan.io/token/${issuerPilot.identity.contractAddress}`} target="_blank" rel="noopener noreferrer">{issuerPilot.identity.contractAddress.slice(0, 8)}...{issuerPilot.identity.contractAddress.slice(-6)} <ArrowUpRight size={12} aria-hidden="true" /></a> : "Not connected"}</dd></div>
                <div><dt>Primary redemption</dt><dd className="unknown-value">Not checked for this asset</dd></div>
                <div><dt>Example metadata source</dt><dd>{asset.quote.source.label}</dd></div>
              </dl>
              <p className="passport-note">{issuerPilot?.identity ? "Contract identity comes from the issuer API. Legal terms, redemption, and venue support still need separate checks." : "Issuer and redemption fields must be verified for the exact live product before use."}</p>
              <a className="external-link" href={issuerDocs} target="_blank" rel="noopener noreferrer">Read issuer product docs <ArrowUpRight size={15} aria-hidden="true" /></a>
            </section>
            <section className="detail-card" aria-labelledby="integration-title">
              <div className="card-header"><div><span className="section-kicker">INTEGRATIONS</span><h2 id="integration-title">Where it can go</h2></div></div>
              <div className="integration-list">
                {asset.integrations.map((integration) => (
                  <div className="integration-row" key={integration.name}>
                    <div><strong>{integration.name}</strong><span>{integration.category}</span></div>
                    <small>{integration.status === "illustrative" ? "DEMO" : "UNVERIFIED"}</small>
                    <p>{integration.detail}</p>
                  </div>
                ))}
              </div>
            </section>
            <div className="sidebar-callout"><span className="section-kicker">THE STOCKSCOPE RULE</span><p>Every number needs a source, a unit, and a timestamp. Unknown stays unknown.</p></div>
          </aside>
        </div>
      </main>
      <footer className="site-footer page-shell"><span>StockScope / Research before action</span><span>Prototype data only</span></footer>
    </>
  );
}
