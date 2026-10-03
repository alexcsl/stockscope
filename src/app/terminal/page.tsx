import { connection } from "next/server";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { TerminalWorkspace } from "@/components/terminal-workspace";
import { SiteHeader } from "@/components/site-header";
import { listSourcedAssets } from "@/lib/robinhood-data";

async function TerminalData({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [assets, query] = await Promise.all([listSourcedAssets(), searchParams]);
  const initialQuery = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : Array.isArray(value) ? value.map((entry) => [key, entry]) : [])).toString();

  return <TerminalWorkspace assets={assets} initialQuery={initialQuery ? `?${initialQuery}` : ""} />;
}

export default function TerminalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><SiteHeader /><Suspense fallback={<main className="page-shell"><PageLoading title="Stock tokens" /></main>}><TerminalData searchParams={searchParams} /></Suspense><footer className="site-footer page-shell"><span>StockScope / Research before action</span><span>Issuer observations / indicative venues / explicit unknowns</span></footer></>;
}
