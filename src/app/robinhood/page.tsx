import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Database } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { RobinhoodUniswapProbe } from "@/components/robinhood-uniswap-probe";

export const metadata: Metadata = {
  title: "Robinhood Chain quote probe | StockScope",
  description: "Read-only Uniswap quote checks for Robinhood Stock Tokens on Robinhood Chain.",
};

export default function RobinhoodQuotePage() {
  return (
    <>
      <SiteHeader active="robinhood" />
      <main className="page-shell detail-main">
        <Link className="back-link" href="/terminal"><ArrowLeft size={15} aria-hidden="true" /> Back to terminal</Link>
        <div className="demo-banner detail-demo" role="note">
          <Database size={17} aria-hidden="true" />
          <span><strong>Quote probe</strong> Requests use Uniswap&apos;s API and Robinhood&apos;s public asset registry. A quote is an indicative observation; this page cannot submit a transaction or determine user eligibility.</span>
        </div>
        <section className="detail-heading" aria-labelledby="robinhood-title">
          <div className="detail-identity">
            <span className="asset-avatar detail-avatar" aria-hidden="true">R</span>
            <div>
              <div className="section-kicker">STOCKSCOPE / SOURCE CHECK</div>
              <h1 id="robinhood-title">Robinhood Chain</h1>
              <p>Uniswap route discovery <span className="identity-separator">/</span> Chain ID 4663</p>
            </div>
          </div>
          <div className="detail-heading-price">
            <span>Quote mode</span>
            <strong>Read only</strong>
            <small>No signing or execution</small>
          </div>
        </section>
        <div className="detail-grid robinhood-probe-grid">
          <div className="detail-primary">
            <RobinhoodUniswapProbe />
          </div>
          <aside className="detail-sidebar">
            <section className="detail-card" aria-labelledby="probe-method-title">
              <div className="card-header">
                <div><span className="section-kicker">METHOD</span><h2 id="probe-method-title">What this checks</h2></div>
              </div>
              <ul className="probe-method-list">
                <li>Resolves the selected symbol to an active Robinhood asset with a chain 4663 deployment.</li>
                <li>Confirms the token and USDG addresses and decimals from Robinhood Chain.</li>
                <li>Requests an exact-input quote across Uniswap v2, v3, and v4.</li>
                <li>Returns only input, output, and route type. Swap calldata and permit details stay server-side and are discarded.</li>
              </ul>
              <p className="passport-note">A route can still fail because of liquidity, token restrictions, API permissions, wallet eligibility, or minimum quote size. No route at one size does not prove the asset has no market.</p>
            </section>
            <section className="detail-card" aria-labelledby="quote-setup-title">
              <div className="card-header">
                <div><span className="section-kicker">LOCAL SETUP</span><h2 id="quote-setup-title">Uniswap API key</h2></div>
              </div>
              <p className="card-intro">Create a key in the <a className="external-link" href="https://developers.uniswap.org/dashboard" target="_blank" rel="noopener noreferrer">Uniswap Developer Platform</a>, then add it to `.env.local`:</p>
              <pre className="env-snippet">UNISWAP_API_KEY=your_key_here</pre>
              <p className="passport-note">Restart the dev server after saving. Keep the key server-side; do not use a `NEXT_PUBLIC_` variable.</p>
            </section>
          </aside>
        </div>
      </main>
      <footer className="site-footer page-shell"><span>StockScope / Research before action</span><span>Indicative quote only</span></footer>
    </>
  );
}
