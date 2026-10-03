"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RobinhoodUniswapProbe } from "./robinhood-uniswap-probe";
import { TradeWorkspace } from "./trade-workspace";

export function SwapDesk() {
  const [market, setMarket] = useState("robinhood");
  const [symbol, setSymbol] = useState("AAPL");
  const [mode, setMode] = useState("quote");
  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      setMarket(query.get("market") === "xstocks" ? "xstocks" : "robinhood");
      const value = query.get("symbol") || "AAPL";
      setSymbol(["AAPL", "NVDA", "TSLA"].includes(value) || /^[A-Za-z0-9]{1,15}x$/.test(value) ? value : "AAPL");
      setMode(query.get("mode") === "testnet" ? "testnet" : "quote");
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function update(nextMarket: string, nextSymbol: string, nextMode: string) {
    setMarket(nextMarket); setSymbol(nextSymbol); setMode(nextMode);
    const url = new URL(window.location.href);
    url.searchParams.set("market", nextMarket); url.searchParams.set("symbol", nextSymbol); url.searchParams.set("mode", nextMode);
    window.history.pushState({}, "", url);
  }
  return <>
    <div className="market-picker"><label>Market<select value={market} onChange={(event) => update(event.target.value, event.target.value === "xstocks" ? "AAPLx" : "AAPL", "quote")}><option value="robinhood">Robinhood / Robinhood Chain / 4663</option><option value="xstocks">xStocks / Arbitrum One / 42161</option></select></label></div>
    {market === "xstocks" ? <section className="detail-card"><div className="card-header"><h2>xStocks swap availability</h2><span className="card-tag">UNAVAILABLE</span></div><p>Wallet execution for xStocks on Arbitrum One is not configured. You can inspect verified pools and charts, save research, and compare issuer records.</p><Link className="external-link" href={`/xstocks/${symbol}`}>Research {symbol}</Link><Link className="external-link" href="/terminal?market=xstocks">Browse xStocks markets</Link></section> : <>
      <div className="desk-controls"><div className="filter-group" role="group" aria-label="Swap mode"><button className={`filter-button${mode === "quote" ? " selected" : ""}`} aria-pressed={mode === "quote"} onClick={() => update(market, symbol, "quote")}>Mainnet quote</button><button className={`filter-button${mode === "testnet" ? " selected" : ""}`} aria-pressed={mode === "testnet"} onClick={() => update(market, symbol, "testnet")}>Testnet swap</button></div></div>
      {mode === "quote" ? <><div className="data-notice"><strong>Robinhood Chain / 4663</strong><span>Connect a wallet and check USDG routes through Uniswap. Mainnet transaction signing is unavailable.</span></div><RobinhoodUniswapProbe key={symbol} initialSymbol={symbol} /></> : <><div className="data-notice"><strong>Testnet swap / separate test tokens</strong><span>Use Robinhood testnet (46630) or Arbitrum Sepolia (421614). Deployment, route and policy checks must pass before wallet approval and submission.</span></div><label className="sort-field">Instrument<select value={symbol} onChange={(event) => update(market, event.target.value, mode)}>{["AAPL", "NVDA", "TSLA"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><TradeWorkspace key={symbol} symbol={symbol} /></>}
    </>}
  </>;
}
