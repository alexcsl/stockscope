import { ArrowUpRight } from "lucide-react";
import { formatUsd } from "@/lib/market-data";
import { issuerSources, type IssuerPilot } from "@/lib/issuer-data";

export function IssuerPilotPanel({ pilot }: { pilot: IssuerPilot }) {
  const { identity } = pilot;

  return (
    <section className="issuer-panel" aria-labelledby="issuer-pilot-title">
      <div className="card-header">
        <div>
          <span className="section-kicker">ISSUER SOURCE / NVDAx</span>
          <h2 id="issuer-pilot-title">Issuer record</h2>
        </div>
        <span className="card-tag">{identity ? "API CHECKED" : "UNAVAILABLE"}</span>
      </div>
      <p className="issuer-intro">
        Public xStocks API values for NVDAx. These are separate from the illustrative venue quote and action checks below.
      </p>
      <dl className="issuer-facts">
        <div>
          <dt>Issuer API price</dt>
          <dd>{pilot.priceUsd === null ? "Unavailable" : formatUsd(pilot.priceUsd)}</dd>
          <small>USD value for NVDAx; unit not independently reconciled</small>
        </div>
        <div>
          <dt>Arbitrum multiplier</dt>
          <dd>{pilot.multiplier === null ? "Unavailable" : pilot.multiplier.toFixed(8)}</dd>
          <small>Issuer-reported current conversion value</small>
        </div>
        <div>
          <dt>Arbitrum token</dt>
          <dd>{identity ? `${identity.contractAddress.slice(0, 8)}...${identity.contractAddress.slice(-6)}` : "Unavailable"}</dd>
          <small>{identity ? `ISIN ${identity.isin}` : "No validated deployment returned"}</small>
        </div>
        <div>
          <dt>Checked at</dt>
          <dd>{pilot.retrievedAt.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</dd>
          <small>Source observation time not supplied</small>
        </div>
      </dl>
      <p className="issuer-caveat">The API may cache upstream prices. No venue, trade size, source timestamp, or freshness guarantee is supplied with this value. It is not an executable quote and does not change demo readiness.</p>
      <div className="issuer-source-links">
        <a href={issuerSources.asset} target="_blank" rel="noopener noreferrer">Asset record <ArrowUpRight size={14} aria-hidden="true" /></a>
        <a href={issuerSources.price} target="_blank" rel="noopener noreferrer">Price response <ArrowUpRight size={14} aria-hidden="true" /></a>
        <a href={issuerSources.multiplier} target="_blank" rel="noopener noreferrer">Multiplier <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
