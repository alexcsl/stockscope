import Link from "next/link";
import { WatchInstrument } from "./watch-instrument";

export function InstrumentHeading({ symbol, name, issuer, contract }: { symbol: string; name: string; issuer: "robinhood" | "xstocks"; contract?: string }) {
  const chainId = issuer === "robinhood" ? 4663 : 42161;
  const market = issuer === "robinhood" ? "Robinhood / Robinhood Chain / 4663" : "xStocks / Arbitrum One / 42161";
  return <>
    <Link className="back-link" href={`/terminal?market=${issuer}`}>Back to terminal / {issuer === "robinhood" ? "Robinhood" : "xStocks"}</Link>
    <section className="detail-heading">
      <div className="detail-identity"><span className={`asset-avatar detail-avatar market-${issuer}`} aria-hidden="true">{symbol[0]}</span><div><span className={`market-badge market-${issuer}`}>{market}</span><h1>{symbol}</h1><p>{name}</p></div></div>
      <div className="desk-links">{contract ? <WatchInstrument issuer={issuer} chainId={chainId} contract={contract} symbol={symbol} /> : null}<Link className="external-link" href={`/terminal?market=${issuer}&section=compare&assets=${issuer}:${symbol}#compare`}>Compare issuers</Link><Link className="external-link" href={`/robinhood?market=${issuer}&symbol=${symbol}`}>Open swap workspace</Link></div>
    </section>
  </>;
}

export function InstrumentSections() {
  return <nav className="asset-section-nav" aria-label="Asset sections">{[["overview", "Overview"], ["markets", "Markets"], ["issuer", "Issuer"], ["events", "Events"], ["research-agent", "Research"], ["action", "Action"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>;
}
