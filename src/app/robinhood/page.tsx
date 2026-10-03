import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SwapDesk } from "@/components/swap-desk";

export const metadata: Metadata = {
  title: "Swap workspace | StockScope",
  description: "Wallet-connected route research and guarded testnet swaps with explicit market availability.",
};

export default function RobinhoodQuotePage() {
  return (
    <>
      <SiteHeader active="robinhood" />
      <main className="page-shell detail-main">
        <Link className="back-link" href="/terminal"><ArrowLeft size={15} aria-hidden="true" /> Back to terminal</Link>
        <section className="detail-heading" aria-labelledby="robinhood-title">
          <div className="detail-identity">
            <span className="asset-avatar detail-avatar" aria-hidden="true">R</span>
            <div>
              <div className="section-kicker">STOCKSCOPE / SWAP</div>
              <h1 id="robinhood-title">Swap workspace</h1>
              <p>Choose a market, inspect a route, and review execution availability</p>
            </div>
          </div>
        </section>
        <SwapDesk />
      </main>
      <footer className="site-footer page-shell"><span>StockScope / Research before action</span><span>Mainnet quotes / guarded testnet execution</span></footer>
    </>
  );
}
