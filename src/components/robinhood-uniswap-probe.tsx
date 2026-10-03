"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { UniswapRoute } from "@/lib/uniswap-route";

const messages: Record<Exclude<UniswapRoute["state"], "available">, string> = {
  not_configured: "Add UNISWAP_API_KEY to .env.local and restart the dev server.",
  wallet_required: "Enter a valid public Robinhood Chain wallet address to request a quote.",
  identity_unavailable: "The issuer token or onchain decimals could not be verified.",
  no_route: "Uniswap returned no route for this pair and size.",
  amount_too_low: "Uniswap returned no quote at this size. Try a larger input amount.",
  unsupported_token: "Uniswap does not currently return a route for this token.",
  auth_failed: "Uniswap rejected the configured API key.",
  access_denied: "Uniswap denied this quote request for the selected asset or wallet.",
  request_rejected: "Uniswap rejected the quote request. Check the selected pair and amount.",
  rate_limited: "Uniswap is rate limiting requests. Wait before trying again.",
  upstream_unavailable: "The route source is unavailable. Try again later.",
  invalid_response: "The route response did not match the requested assets and size.",
};

function units(value: string, decimals: number, fractionDigits: number) {
  const raw = BigInt(value);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").slice(0, fractionDigits).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function RobinhoodUniswapProbe() {
  const [symbol, setSymbol] = useState("AAPL");
  const [sizeUsd, setSizeUsd] = useState(1000);
  const [swapper, setSwapper] = useState("");
  const [result, setResult] = useState<UniswapRoute | null>(null);
  const [pending, setPending] = useState(false);
  const [clock, setClock] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => { clearInterval(timer); controller.current?.abort(); }; }, []);

  async function checkRoute() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setResult(null);
    setPending(true);
    try {
      const response = await fetch("/api/market/uniswap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, sizeUsd, swapper }),
        signal: current.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Route check failed");
      const value: UniswapRoute = await response.json();
      if (!current.signal.aborted) setResult(value);
    } catch {
      if (!current.signal.aborted) setResult({ state: "upstream_unavailable", checkedAt: new Date().toISOString(), sizeUsd, symbol });
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }

  return (
    <section className="issuer-panel route-panel" aria-labelledby="uniswap-route-title">
      <div className="card-header">
        <div><span className="section-kicker">VENUE SOURCE / ROBINHOOD CHAIN</span><h2 id="uniswap-route-title">Uniswap route check</h2></div>
        <span className="card-tag">READ ONLY</span>
      </div>
      <p className="issuer-intro">Request an indicative USDG to Stock Token quote from Uniswap&apos;s Trading API. The API key stays on the server. This check never creates or submits a transaction.</p>
      <div className="route-controls">
        <label htmlFor="uniswap-token">Stock Token</label>
        <select id="uniswap-token" value={symbol} onChange={(event) => { controller.current?.abort(); setPending(false); setSymbol(event.target.value); setResult(null); }}>
          <option value="AAPL">AAPL</option>
          <option value="NVDA">NVDA</option>
          <option value="TSLA">TSLA</option>
        </select>
        <label htmlFor="uniswap-size">USDG input</label>
        <select id="uniswap-size" value={sizeUsd} onChange={(event) => { controller.current?.abort(); setPending(false); setSizeUsd(Number(event.target.value)); setResult(null); }}>
          <option value={100}>100 USDG</option>
          <option value={1000}>1,000 USDG</option>
          <option value={10000}>10,000 USDG</option>
        </select>
        <label className="wallet-input-label" htmlFor="uniswap-swapper">Public wallet address</label>
        <input id="uniswap-swapper" className="wallet-address-input" value={swapper} onChange={(event) => { setSwapper(event.target.value.trim()); setResult(null); }} autoComplete="off" spellCheck={false} placeholder="0x..." />
        <button type="button" onClick={checkRoute} disabled={pending}>{pending ? "Checking route" : "Check route"}</button>
      </div>
      <p className="route-disclosure">The address is sent to Uniswap as the quote wallet. It is public account data. No signature or token approval is requested.</p>
      <div className="route-result" role="status" aria-live="polite">
        {pending ? <p>Verifying the Robinhood token contract and requesting an indicative route...</p> : result?.state === "available" && result.outputAmount && result.inputAmount ? (
          <>
            <div className="route-numbers"><div><span>USDG input</span><strong>{units(result.inputAmount, 6, 2)} USDG</strong></div><div><span>Estimated output</span><strong>{units(result.outputAmount, 18, 6)} {result.symbol}</strong></div></div>
            <p>{result.expiresAt && clock >= Date.parse(result.expiresAt) ? "This quote expired. Request a new observation." : `Indicative API quote via ${result.routing}. It may change before execution; this page has no trade action.`}</p>
          </>
        ) : <p>{result ? result.state === "available" ? "The quote response did not include the expected output amount." : messages[result.state] : "Choose an asset and size, enter a public wallet address, then check the route."}</p>}
      </div>
      <div className="route-evidence">
        <span>Source: <a href="https://developers.uniswap.org/docs/trading/swapping-api/overview" target="_blank" rel="noopener noreferrer">Uniswap Trading API <ArrowUpRight size={11} aria-hidden="true" /></a></span>
        <span>Identity: <a href="https://docs.robinhood.com/chain/stock-token-apis/" target="_blank" rel="noopener noreferrer">Robinhood public asset registry <ArrowUpRight size={11} aria-hidden="true" /></a></span>
        <span>Chain: Robinhood Chain (4663)</span>
        {result?.tokenAddress ? <span>Token: <a href={`https://robinhoodchain.blockscout.com/token/${result.tokenAddress}`} target="_blank" rel="noopener noreferrer">{result.tokenAddress.slice(0, 8)}...{result.tokenAddress.slice(-6)} <ArrowUpRight size={11} aria-hidden="true" /></a></span> : null}
        {result?.stablecoinAddress ? <span>Input token: <a href={`https://robinhoodchain.blockscout.com/token/${result.stablecoinAddress}`} target="_blank" rel="noopener noreferrer">USDG <ArrowUpRight size={11} aria-hidden="true" /></a></span> : null}
        <span>{result ? `Checked: ${result.checkedAt.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}` : "Checked: pending"}</span>
        <span>Provider observation time: unavailable</span>
        {result?.expiresAt ? <span>Expires: {result.expiresAt}</span> : null}
        <span>Route result is an API estimate, not a firm order or liquidity-depth measure.</span>
      </div>
    </section>
  );
}
