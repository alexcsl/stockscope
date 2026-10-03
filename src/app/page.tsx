import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LandingMotion } from "@/components/landing-motion";
import { LandingScroll } from "@/components/landing-scroll";
import { SiteHeader } from "@/components/site-header";
import "./landing.css";

export default function Home() {
  return (
    <>
      <SiteHeader active="home" />
      <main className="landing">
        <LandingScroll />
        <section className="landing-hero page-shell" aria-labelledby="landing-title">
          <div className="landing-hero-grid">
            <div className="landing-hero-copy"><h1 id="landing-title">The market desk for <em>Stock Tokens.</em></h1><p>StockScope connects the exact token contract to issuer terms, market observations, and an action check you can inspect. Start with the record. Follow each source. Then decide what to do.</p><div className="landing-hero-actions"><Link className="landing-primary" href="/terminal">Open terminal <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> for sourced Stock Token research</span></Link><span>Research Robinhood Stock Tokens and xStocks across supported chains.</span></div><span className="landing-caveat">Venue quotes are indicative. Trading requires a fresh policy check, simulation, and your wallet signature.</span></div>
            <div className="landing-hero-art" aria-label="StockScope research sequence"><div className="landing-art-heading"><span>RESEARCH RECORD</span><span>ROBINHOOD CHAIN / 4663</span></div><div className="landing-art-lead"><span className="landing-art-signal" aria-hidden="true"><span /><span /><span /><i /></span><strong>One instrument.<br />Four distinct questions.</strong><p>Each answer stays attached to its source, unit and time.</p></div><div className="landing-art-sequence"><span className="landing-story-progress" aria-hidden="true" /><div className="landing-art-step"><span>01</span><div><strong>Instrument</strong><small>Issuer identity · exact contract</small></div></div><div className="landing-art-step"><span>02</span><div><strong>Reference</strong><small>Issuer observation · multiplier</small></div></div><div className="landing-art-step"><span>03</span><div><strong>Venue</strong><small>Route estimate · named size</small></div></div><div className="landing-art-step"><span>04</span><div><strong>Action</strong><small>Policy checks · evidence trail</small></div></div></div><div className="landing-art-foot">UNKNOWN REMAINS UNKNOWN <span>↗</span></div></div>
          </div>
          <div className="landing-hero-foot"><span>RESEARCH BEFORE ACTION</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>
        <section className="landing-thesis" aria-labelledby="thesis-title"><div className="page-shell landing-thesis-inner"><span className="section-kicker">WHY THIS DESK EXISTS</span><h2 id="thesis-title">A ticker is only the beginning of the record.</h2><p>StockScope keeps issuer terms, chain observations, venue estimates and action checks distinct, with their evidence in reach.</p></div></section>
        <LandingMotion />
        <section className="landing-method page-shell" aria-labelledby="landing-method-title"><div><span className="section-kicker">METHOD / FOUR CHECKS</span><h2 id="landing-method-title">Follow the evidence.</h2></div><ol><li><span>01</span><div><h3>Resolve the instrument</h3><p>Match the issuer record to the exact chain and contract.</p></div></li><li><span>02</span><div><h3>Read the source</h3><p>Keep issuer references, onchain state, and venue estimates in their own units and time windows.</p></div></li><li><span>03</span><div><h3>Check the size</h3><p>Request an indicative quote for a named amount and see where a route is unavailable.</p></div></li><li><span>04</span><div><h3>Inspect the decision</h3><p>Review deterministic checks and their evidence before asking a wallet to sign.</p></div></li></ol></section>
        <section className="landing-preview page-shell" aria-labelledby="landing-preview-title"><div><span className="section-kicker">PRODUCT PREVIEW / SOURCE-BACKED</span><h2 id="landing-preview-title">The working desk.</h2><p>The terminal brings Robinhood Stock Tokens and the discovered xStocks catalog into one market desk. Issuer references, chain checks, and venue estimates retain separate states. Missing depth and collateral evidence remain unavailable.</p><Link className="landing-text-link" href="/terminal">Enter sourced terminal <ArrowUpRight size={16} aria-hidden="true" /></Link></div><div className="landing-preview-panel"><div className="landing-preview-top"><span>STOCKSCOPE / TERMINAL</span><span>RESEARCH MODE</span></div><div className="landing-preview-head"><span>INSTRUMENT</span><span>ISSUER REFERENCE</span><span>ACTION</span></div>{["AAPL", "NVDA", "TSLA"].map((symbol) => <div className="landing-preview-row" key={symbol}><strong>{symbol}</strong><span>Source and time on asset page</span><Link href={`/market/${symbol.toLowerCase()}`}>Inspect record →</Link></div>)}<div className="landing-preview-bottom">Illustrative interface. No current market values shown.</div></div></section>
        <section className="landing-final" aria-labelledby="landing-final-title"><div className="page-shell"><span className="section-kicker">STOCKSCOPE / OPEN THE DESK</span><h2 id="landing-final-title">Research before action.</h2><Link className="landing-primary" href="/terminal">Open terminal <ArrowUpRight size={17} aria-hidden="true" /></Link><p>StockScope is independent and is not affiliated with or endorsed by Robinhood. Stock Tokens provide economic exposure under issuer terms, without ownership of the underlying shares.</p></div></section>
      </main>
      <footer className="site-footer page-shell"><span>StockScope / Research before action</span><Link href="/terminal">Terminal</Link></footer>
    </>
  );
}
