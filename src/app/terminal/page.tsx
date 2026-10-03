import { connection } from "next/server";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SourcedTerminal } from "@/components/sourced-terminal";
import { SiteHeader } from "@/components/site-header";
import { ResearchTools } from "@/components/research-tools";
import { OperatorDesk } from "@/components/operator-desk";
import { listSourcedAssets } from "@/lib/robinhood-data";

async function TerminalData() {
  await connection();
  const assets = await listSourcedAssets();

  return <><SourcedTerminal assets={assets} /><div className="page-shell"><ResearchTools assets={assets} /><OperatorDesk assets={assets} /></div></>;
}

export default function TerminalPage() {
  return <><SiteHeader /><Suspense fallback={<main className="page-shell"><PageLoading title="Stock tokens" /></main>}><TerminalData /></Suspense><footer className="site-footer page-shell"><span>StockScope / Research before action</span><span>Issuer observations / indicative venues / explicit unknowns</span></footer></>;
}
