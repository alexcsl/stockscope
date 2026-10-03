"use client";

import { useEffect, useRef, useState } from "react";
import type { IndicativeRoute } from "@/lib/indicative-route";

const messages: Record<Exclude<IndicativeRoute["state"], "available">, string> = {
  not_configured: "Route feed is not configured yet.",
  identity_unavailable: "Token identity or onchain units could not be confirmed.",
  no_route: "0x found no route for this pair and size.",
  rwa_access_required: "0x requires RWA opt-in for xStocks on this account.",
  auth_failed: "0x rejected the configured API key.",
  access_denied: "0x denied this route request.",
  request_rejected: "0x rejected this pair or amount.",
  rate_limited: "The route source is busy. Try again later.",
  upstream_unavailable: "The route source is unavailable. Try again later.",
  invalid_response: "The route source returned data that could not be verified.",
};

function units(value: string, decimals: number, fractionDigits: number) {
  const raw = BigInt(value);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").slice(0, fractionDigits).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function IndicativeRoutePanel({ tokenAddress, usdcAddress }: { tokenAddress?: string; usdcAddress?: string }) {
  const [size, setSize] = useState("1000");
  const [result, setResult] = useState<IndicativeRoute | null>(null);
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function checkRoute() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setResult(null);
    setPending(true);
    try {
      const response = await fetch(`/api/market/indicative?asset=nvdax&sizeUsd=${size}`, { signal: current.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Route check failed");
      const value: IndicativeRoute = await response.json();
      if (!current.signal.aborted) setResult(value);
    } catch {
      if (!current.signal.aborted) setResult({ state: "upstream_unavailable", checkedAt: new Date().toISOString(), sizeUsd: Number(size) });
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }

  return (
    <section className="issuer-panel route-panel" aria-labelledby="route-panel-title">
      <div className="card-header">
        <div><span className="section-kicker">VENUE SOURCE / ARBITRUM</span><h2 id="route-panel-title">Indicative route check</h2></div>
        <span className="card-tag">READ ONLY</span>
      </div>
      <p className="issuer-intro">Check whether 0x currently finds a USDC to NVDAx route for one amount. This is an indicative API response, not a firm quote or an order.</p>
      <div className="route-controls">
        <label htmlFor="route-size">USDC input</label>
        <select id="route-size" value={size} onChange={(event) => { controller.current?.abort(); setPending(false); setSize(event.target.value); setResult(null); }}>
          <option value="100">100 USDC</option>
          <option value="1000">1,000 USDC</option>
          <option value="10000">10,000 USDC</option>
        </select>
        <button type="button" onClick={checkRoute} disabled={pending}>{pending ? "Checking route" : "Check route"}</button>
      </div>
      <div className="route-result" role="status" aria-live="polite">
        {pending ? <p>Checking token contracts and route source...</p> : result?.state === "available" && result.buyAmount && result.sellAmount ? (
          <>
            <div className="route-numbers"><div><span>USDC input</span><strong>{units(result.sellAmount, 6, 2)} USDC</strong></div><div><span>Estimated output</span><strong>{units(result.buyAmount, 18, 6)} NVDAx</strong></div></div>
            <p>Indicative only. Fees and network costs may be separate. The response does not authorize a trade.</p>
          </>
        ) : <p>{result ? messages[result.state as Exclude<IndicativeRoute["state"], "available">] : "Choose an amount, then check the route."}</p>}
      </div>
      <div className="route-evidence">
        <span>Source: <a href="https://docs.0x.org/api-reference/evm-ap-is/swap/allowanceholder-getprice" target="_blank" rel="noopener noreferrer">0x Swap API v2</a></span>
        {result?.state === "rwa_access_required" ? <span><a href="https://help.0x.org/articles/5420296643-xstocks-support-on-0x" target="_blank" rel="noopener noreferrer">0x RWA access requirements</a></span> : null}
        <span>Chain: Arbitrum One</span>
        {tokenAddress && usdcAddress ? <span>Issuer-reported pair: <a href={`https://arbiscan.io/token/${usdcAddress}`} target="_blank" rel="noopener noreferrer" title={usdcAddress}>USDC</a> to <a href={`https://arbiscan.io/token/${tokenAddress}`} target="_blank" rel="noopener noreferrer" title={tokenAddress}>NVDAx</a></span> : null}
        <span>{result ? `Checked: ${result.checkedAt.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}` : "Checked: pending"}</span>
        <span>Source observation time: {result?.state === "available" || result?.state === "no_route" ? "not supplied" : "unavailable"}</span>
        {result?.sources?.length ? <span>Route: {result.sources.join(" + ")}</span> : null}
      </div>
    </section>
  );
}
