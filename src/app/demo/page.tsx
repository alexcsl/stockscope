import { MarketTerminal } from "@/components/market-terminal";
import { SiteHeader } from "@/components/site-header";
import { demoMarketDataProvider } from "@/lib/market-data";

export default async function DemoPage() {
  return <><SiteHeader active="demo" /><MarketTerminal assets={await demoMarketDataProvider.listAssets()} /><footer className="site-footer page-shell"><span>StockScope demo</span><span>All overview values and readiness states are fixtures.</span></footer></>;
}
