"use client";

import { useEffect, useState } from "react";
import type { SourcedAsset } from "@/lib/robinhood-data";
import type { CatalogSnapshot } from "@/lib/xstocks-catalog";
import { SourcedTerminal } from "./sourced-terminal";
import { ResearchTools } from "./research-tools";
import { ComparisonDesk } from "./comparison-desk";
import { OperatorDesk } from "./operator-desk";

export function TerminalWorkspace({ assets, initialQuery }: { assets: SourcedAsset[]; initialQuery: string }) {
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market/catalog", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("catalog_unavailable");
      const result = await response.json() as CatalogSnapshot;
      if (!controller.signal.aborted) { setCatalog(result); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setError("xStocks catalog unavailable. Robinhood records remain accessible."); });
    return () => controller.abort();
  }, [attempt]);
  return <>
    <SourcedTerminal assets={assets} initialQuery={initialQuery} catalog={catalog} catalogError={error} retryCatalog={() => { setError(""); setAttempt((value) => value + 1); }} />
    <div className="page-shell">
      <ResearchTools assets={assets} xstocks={catalog?.assets || []} />
      <section className="terminal-comparison" id="compare" aria-labelledby="compare-title">
        <div className="desk-heading"><div><span className="section-kicker">ISSUER COMPARISON</span><h2 id="compare-title">Compare stock tokens</h2><p>Compare up to four exact instruments across issuers and chains.</p></div></div>
        <ComparisonDesk key={initialQuery} initialCatalog={catalog} embedded />
      </section>
      <OperatorDesk assets={assets} />
    </div>
  </>;
}
