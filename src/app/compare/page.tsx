import Link from "next/link";
import { ComparisonDesk } from "@/components/comparison-desk";
import { SiteHeader } from "@/components/site-header";

export default function ComparePage() {
  return <><SiteHeader active="compare" /><main className="page-shell compare-main"><div className="desk-heading"><div><span className="section-kicker">ISSUER COMPARISON</span><h1>Compare stock tokens</h1><p>Find a company, select up to four tokens, and compare the evidence available for each.</p></div><Link className="external-link" href="/terminal">Back to terminal</Link></div><ComparisonDesk /></main></>;
}
