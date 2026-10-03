"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="page-shell page-loading"><h1>This page could not load</h1><p>Your saved research is still available. Retry the page or return to the terminal.</p><div className="workflow-actions"><button onClick={reset}>Retry page</button><Link href="/terminal">Open terminal</Link></div></main>;
}
