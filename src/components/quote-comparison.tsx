"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits, isAddress } from "viem";
import type { UniswapRoute } from "@/lib/uniswap-route";
import { impliedUsdgPerToken, quoteExpired } from "@/lib/quote-comparison";

const sizes = [1, 5, 10] as const;
const sellSizes = ["0.01", "0.05", "0.1"] as const;
type Slot = { state: "idle" | "loading" | "error"; quote?: UniswapRoute; message?: string };

export function QuoteComparison({ symbol }: { symbol: string }) {
  const [address, setAddress] = useState("");
  const [slots, setSlots] = useState<Slot[]>(sizes.map(() => ({ state: "idle" })));
  const [sellSlots, setSellSlots] = useState<Slot[]>(sellSizes.map(() => ({ state: "idle" })));
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(() => Date.now());
  const requestId = useRef(0);

  useEffect(() => { const timer = setInterval(() => setTime(Date.now()), 1000); return () => clearInterval(timer); }, []);

  async function check() {
    if (!isAddress(address)) return;
    const currentRequest = ++requestId.current;
    setBusy(true);
    setSlots(sizes.map(() => ({ state: "loading" })));
    setSellSlots(sellSizes.map(() => ({ state: "loading" })));
    await Promise.all([...sizes.map((size) => ({ sizeUsd: size, direction: "buy" as const })), ...sellSizes.map((tokenAmount) => ({ sizeUsd: 0, direction: "sell" as const, tokenAmount }))].map(async (request, index) => {
      let slot: Slot;
      try {
        const response = await fetch("/api/market/uniswap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol, ...request, swapper: address }), cache: "no-store" });
        const data: unknown = await response.json();
        slot = response.ok && data && typeof data === "object" && "state" in data ? { state: "idle", quote: data as UniswapRoute } : { state: "error", message: response.status === 429 ? "Request limit reached. Try again in one minute." : "Quote request failed." };
      } catch { slot = { state: "error", message: "Quote source could not be reached." }; }
      if (requestId.current === currentRequest) {
        if (index < sizes.length) setSlots((current) => current.map((item, position) => position === index ? slot : item));
        else setSellSlots((current) => current.map((item, position) => position === index - sizes.length ? slot : item));
      }
    }));
    if (requestId.current === currentRequest) setBusy(false);
  }

  return <section className="detail-card" aria-labelledby="quote-comparison-title"><div className="card-header"><div><span className="section-kicker">RESEARCH / SIZE COMPARISON</span><h2 id="quote-comparison-title">Venue quote comparison</h2></div><span className="card-tag">INDICATIVE</span></div><p className="card-intro">Check 1, 5 and 10 USDG buys and 0.01, 0.05 and 0.1 token sells independently. Each result is a temporary Uniswap API estimate for this public address. Fees and gas are unavailable for comparison; no net execution price is claimed.</p><div className="route-controls"><label className="wallet-input-label" htmlFor="quote-address">Public address for quote context</label><input id="quote-address" value={address} onChange={(event) => { requestId.current++; setBusy(false); setAddress(event.target.value); setSlots(sizes.map(() => ({ state: "idle" }))); setSellSlots(sellSizes.map(() => ({ state: "idle" }))); }} placeholder="0x…" autoComplete="off" spellCheck={false} /><button type="button" onClick={check} disabled={busy || !isAddress(address)}>Check buy and sell sizes</button></div><p className="cell-meta">No wallet connection or signature is needed. The public address is sent to Uniswap for each requested estimate.</p><h3>Buy estimates</h3><div className="quote-comparison-list">{sizes.map((size, index) => {
    const slot = slots[index];
    const route = slot.quote;
    const expired = route ? quoteExpired(route, time) : false;
    const rate = route ? impliedUsdgPerToken(route) : null;
    return <div className="quote-comparison-item" key={size}><strong>{size} USDG</strong>{slot.state === "loading" ? <p role="status">Checking route…</p> : slot.state === "error" ? <p role="status">{slot.message}</p> : route ? <><p>Status: {route.state === "available" && expired ? "Expired" : route.state.replaceAll("_", " ")}</p>{route.state === "available" ? <><p>Input: {formatUnits(BigInt(route.inputAmount || "0"), 6)} USDG</p><p>Estimated output: {formatUnits(BigInt(route.outputAmount || "0"), 18)} {symbol}</p><p>Implied unit rate: {rate || "Unavailable"} USDG per {symbol}</p><p>Route type: {route.routing || "Unknown"}{route.pool ? ` / V${route.pool.protocol}` : " / pool not verified"}</p><p>Checked: {route.checkedAt}</p><p>Expires: {route.expiresAt || "Unavailable"}</p></> : <p>No current estimate for this size. Other sizes retain their own state.</p>}</> : <p>Not checked</p>}</div>;
  })}</div><h3>Sell estimates</h3><div className="quote-comparison-list">{sellSizes.map((amount, index) => { const slot = sellSlots[index]; const route = slot.quote; const expired = route ? quoteExpired(route, time) : false; return <div className="quote-comparison-item" key={amount}><strong>{amount} {symbol}</strong>{slot.state === "loading" ? <p role="status">Checking route…</p> : slot.state === "error" ? <p role="status">{slot.message}</p> : route ? <><p>Status: {route.state === "available" && expired ? "Expired" : route.state.replaceAll("_", " ")}</p>{route.state === "available" ? <><p>Estimated output: {formatUnits(BigInt(route.outputAmount || "0"), 6)} USDG</p><p>Route: {route.routing || "Unknown"}{route.pool ? ` / V${route.pool.protocol}` : " / pool not verified"}</p><p>Checked: {route.checkedAt}</p><p>Expires: {route.expiresAt || "Unavailable"}</p></> : <p>No current sell estimate for this size.</p>}</> : <p>Not checked</p>}</div>; })}</div><div className="source-meta"><a href="https://developers.uniswap.org/docs/api-reference/aggregator_quote" target="_blank" rel="noopener noreferrer">Uniswap Trading API quote documentation</a><span>Issuer reference and onchain oracle prices are separate from these venue estimates.</span></div></section>;
}
