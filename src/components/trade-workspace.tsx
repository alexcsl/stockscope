"use client";

import { useEffect, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, formatEther, formatUnits, parseUnits, type EIP1193Provider } from "viem";
import { ActionProgress } from "./action-progress";
import { InfoTip } from "./info-tip";
import { policyLanguage } from "@/lib/policy-language";
import type { TradePreparation } from "@/lib/execution-abi";
import type { AnalystResult } from "@/lib/analyst";
import { executionChainAllowed } from "@/lib/execution-network";
import { discoverWallets, requestAccounts, type WalletOption } from "@/lib/evm-wallet";

type Wallet = EIP1193Provider & { on?: (event: string, callback: () => void) => void; removeListener?: (event: string, callback: () => void) => void };
type PendingTrade = { hash: string; evidenceHash: string; state: string; explorer?: string };

export function TradeWorkspace({ symbol }: { symbol: string }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletId, setWalletId] = useState("");
  const connectedProvider = useRef<Wallet | null>(null);
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("5");
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [result, setResult] = useState<TradePreparation | null>(null);
  const [analyst, setAnalyst] = useState<AnalystResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Testnet-only mode. Mainnet quotes can be researched, but mainnet approvals and transactions are disabled.");
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([]);
  const [clock, setClock] = useState(0);
  const sequence = useRef(0);
  const wallet = () => connectedProvider.current || (window as Window & { ethereum?: Wallet }).ethereum;

  useEffect(() => {
    let active = true;
    void discoverWallets().then((options) => { if (active) { setWallets(options); setWalletId(options[0]?.id || ""); } });
    const params = new URLSearchParams(window.location.search);
    const proposedDirection = params.get("direction");
    const proposedAmount = params.get("amount");
    const savedProposal = params.get("proposalId");
    if (savedProposal && /^0x[\da-f]{64}$/i.test(savedProposal)) queueMicrotask(() => setProposalId(savedProposal));
    if ((proposedDirection === "buy" || proposedDirection === "sell") && proposedAmount && (proposedDirection === "buy" ? /^(0|[1-9]\d*)(\.\d{1,6})?$/ : /^(0|[1-9]\d*)(\.\d{1,18})?$/).test(proposedAmount) && Number(proposedAmount) > 0) {
      queueMicrotask(() => { setDirection(proposedDirection); setAmount(proposedAmount); setMessage("Proposal input loaded. Connect a wallet and check the current route and policy before signing."); });
    }
    const provider = wallet();
    const reset = () => { sequence.current++; setAccount(null); setResult(null); setPendingTrades([]); setBusy(false); setMessage("Wallet account or network changed. Connect again before checking a trade."); };
    provider?.on?.("accountsChanged", reset);
    provider?.on?.("chainChanged", reset);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); provider?.removeListener?.("accountsChanged", reset); provider?.removeListener?.("chainChanged", reset); };
  }, []);
  useEffect(() => {
    const provider = connectedProvider.current;
    const reset = () => { sequence.current++; setAccount(null); setResult(null); setPendingTrades([]); setBusy(false); setMessage("Wallet account or network changed. Connect again and request a fresh check."); };
    provider?.on?.("accountsChanged", reset); provider?.on?.("chainChanged", reset);
    return () => { provider?.removeListener?.("accountsChanged", reset); provider?.removeListener?.("chainChanged", reset); };
  }, [account]);

  function invalidate() { sequence.current++; setResult(null); setAnalyst(null); }
  function editInput() { invalidate(); setProposalId(null); }
  function savePending(trades: PendingTrade[], owner = account) {
    setPendingTrades(trades);
    try { if (owner) localStorage.setItem(`stockscope:trades:${owner.toLowerCase()}`, JSON.stringify(trades)); return true; }
    catch { return false; }
  }
  function describeError(error: unknown) {
    return (error as { code?: number })?.code === 4001 ? "The wallet request was rejected. Earlier approvals or submitted transactions retain their own state." : error instanceof Error && error.message.includes("timed out") ? error.message : "The request failed. Check wallet state and refresh the policy evidence before retrying.";
  }
  async function connect() {
    setBusy(true);
    try {
      const provider = wallets.find((option) => option.id === walletId)?.provider || wallet();
      if (!provider) { setMessage("No injected EVM wallet was found. Open this page with a compatible wallet installed."); return; }
      const accounts = await requestAccounts(provider);
      const user = accounts[0];
      if (!user) throw new Error("wallet_empty");
      const chain = await provider.request({ method: "eth_chainId" });
      if (!executionChainAllowed(Number(chain))) { setMessage("Use Arbitrum Sepolia (421614) or Robinhood testnet (46630). Mainnet signing is disabled."); return; }
      setAccount(user);
      connectedProvider.current = provider;
      invalidate();
      const saved = JSON.parse(localStorage.getItem(`stockscope:trades:${user.toLowerCase()}`) || "[]");
      setPendingTrades(Array.isArray(saved) ? saved.filter((item) => /^0x[\da-f]{64}$/i.test(item?.hash) && /^0x[\da-f]{64}$/i.test(item?.evidenceHash)).slice(-20) : []);
      setMessage("Wallet connected. A route check does not request an approval or transaction signature.");
    } catch (error) { setMessage(describeError(error)); }
    finally { setBusy(false); }
  }
  async function prepare(): Promise<TradePreparation> {
    if (!account || !new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${direction === "buy" ? 6 : 18}})?$`).test(amount)) throw new Error("invalid_input");
    const inputAmount = parseUnits(amount, direction === "buy" ? 6 : 18).toString();
    if (BigInt(inputAmount) <= BigInt(0)) throw new Error("zero_input");
    if (direction === "buy" && BigInt(inputAmount) > BigInt(10_000_000)) throw new Error("amount_limit");
    const response = await fetch("/api/trade/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, direction, inputAmount, user: account, ...(proposalId ? { proposalId } : {}) }), cache: "no-store" });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Trade preparation failed."); }
    return response.json();
  }
  async function check() {
    const current = ++sequence.current;
    setBusy(true); setResult(null); setAnalyst(null);
    try { const next = await prepare(); if (current === sequence.current) { setResult(next); setMessage(next.message); try { localStorage.setItem(`stockscope:policy:${symbol}`, next.decision.evidenceHash); } catch {} } }
    catch (error) { if (current === sequence.current) setMessage(error instanceof Error ? error.message : "Check the amount, draft expiry, and wallet."); }
    finally { if (current === sequence.current) setBusy(false); }
  }
  async function approve() {
    if (!account || !result?.approval) return;
    if (!result.network?.testnet || !executionChainAllowed(result.network.chainId)) { setMessage("A verified testnet deployment is required for approvals."); return; }
    setBusy(true);
    try {
      const provider = wallet();
      if (!provider || Number(await provider.request({ method: "eth_chainId" })) !== result.network.chainId) throw new Error("wrong_chain");
      const verifyWallet = async () => {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (accounts[0]?.toLowerCase() !== account.toLowerCase() || Number(await provider.request({ method: "eth_chainId" })) !== result.network!.chainId) throw new Error("wallet_changed");
      };
      await verifyWallet();
      const { token, spender, amount } = result.approval;
      const waitForApproval = async (hash: `0x${string}`) => {
        for (let attempt = 0; attempt < 45; attempt++) {
          const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
          if (receipt) { if (receipt.status !== "0x1") throw new Error("approval_reverted"); return; }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        throw new Error("approval_pending");
      };
      const zero = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, BigInt(0)] });
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: account, to: token, data: zero }] });
      setMessage(`Allowance reset submitted: ${hash}. Wait for confirmation, then approve the exact input.`);
      await waitForApproval(hash);
      await verifyWallet();
      const exact = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, BigInt(amount)] });
      const approved = await provider.request({ method: "eth_sendTransaction", params: [{ from: account, to: token, data: exact }] });
      setMessage(`Exact-input approval submitted: ${approved}. Wait for confirmation, then check the policy again.`);
      await waitForApproval(approved);
      setResult(null);
    } catch (error) { setMessage(describeError(error)); }
    finally { setBusy(false); }
  }
  async function execute() {
    if (!account || !result?.transaction || result.decision.status !== "eligible") return;
    if (!result.network?.testnet || !executionChainAllowed(result.network.chainId)) { setMessage("A verified testnet deployment is required for execution."); return; }
    setBusy(true);
    try {
      const provider = wallet();
      if (!provider || Number(await provider.request({ method: "eth_chainId" })) !== result.network.chainId) throw new Error("wrong_chain");
      const fresh = await prepare();
      setResult(fresh);
      if (!fresh.transaction || fresh.decision.status !== "eligible" || !fresh.network?.testnet || fresh.network.chainId !== result.network.chainId || fresh.network.stockToken !== result.network.stockToken || fresh.network.stablecoin !== result.network.stablecoin || fresh.transaction.to !== result.transaction.to) { setMessage("Execution bindings changed or checks failed. Review a fresh check before signing."); return; }
      const accounts = await provider.request({ method: "eth_accounts" });
      if (accounts[0]?.toLowerCase() !== account.toLowerCase() || Number(await provider.request({ method: "eth_chainId" })) !== fresh.network.chainId) throw new Error("wallet_changed");
      if (!fresh.decision.expiresAt || Date.parse(fresh.decision.expiresAt) <= Date.now() + 2000) { setMessage("The quote expired during verification. Check the route again."); return; }
      if (BigInt(fresh.quote.outputAmount || "0") < BigInt(result.quote.outputAmount || "0")) { setMessage("Estimated output decreased. Review the new estimate and fees, then confirm again if acceptable."); return; }
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: account, to: fresh.transaction.to, data: fresh.transaction.data, value: fresh.transaction.value, gas: `0x${BigInt(fresh.transaction.gas).toString(16)}` }] });
      const saved = savePending([...pendingTrades, { hash, evidenceHash: fresh.decision.evidenceHash, state: "pending", explorer: fresh.network.explorer }].slice(-20));
      setMessage(saved ? "Transaction submitted. Reconcile its receipt below; submission does not mean confirmation." : `Transaction submitted: ${hash}. Browser persistence failed; copy this reference for recovery.`);
      setResult(null);
    } catch (error) { setMessage(describeError(error)); }
    finally { setBusy(false); }
  }
  async function reconcile(trade: PendingTrade) {
    setBusy(true);
    try {
      const response = await fetch("/api/trade/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hash: trade.hash, evidenceHash: trade.evidenceHash }) });
      if (!response.ok) throw new Error("receipt_failed");
      const receipt = await response.json();
      savePending(pendingTrades.map((item) => item.hash === trade.hash ? { ...item, state: receipt.state } : item));
      setMessage(receipt.state === "confirmed" ? `Confirmed and reconciled: output ${receipt.outputAmount} raw units, gas ${receipt.gasUsed}. Export the evidence for the complete record.` : `Transaction state: ${receipt.state}.`);
    } catch { setMessage("Receipt reconciliation is unavailable. The transaction reference is saved in this browser for recovery."); }
    finally { setBusy(false); }
  }
  async function explain() {
    setBusy(true);
    try {
      const response = await fetch("/api/analyst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, evidenceHash: result?.decision.evidenceHash }) });
      if (!response.ok) throw new Error("analyst_failed");
      setAnalyst(await response.json());
    } catch { setAnalyst({ state: "provider_failed", message: "The explanation is unavailable. Inspect the source evidence directly." }); }
    finally { setBusy(false); }
  }
  const expired = !result?.decision.expiresAt || clock === 0 || clock >= Date.parse(result.decision.expiresAt);
  return <>
    <section className="detail-card" aria-labelledby="trade-title"><div className="card-header"><div><span className="section-kicker">TESTNET EXECUTION / MAINNET RESEARCH</span><h2 id="trade-title">Check before signing</h2></div><span className="card-tag">USER SIGNED</span></div>
      <ActionProgress step={pendingTrades.some((trade) => trade.state === "pending") ? 5 : result?.transaction ? 4 : result?.approval ? 3 : result ? 2 : account ? 1 : 0} /><p className="card-intro">Choose what to buy or sell and how much to spend. We check the token, trading pool, current price evidence, and whether the transaction would succeed before asking you to sign.</p>
      <p className="cell-meta">Your public wallet address is sent to the route provider when checking a quote. Wallet connection alone never approves spending.</p>
      <div className="route-controls"><label htmlFor="trade-direction">Direction</label><select id="trade-direction" value={direction} disabled={busy} onChange={(event) => { editInput(); setDirection(event.target.value as "buy" | "sell"); setAmount(event.target.value === "buy" ? "5" : "0.01"); }}><option value="buy">Buy {symbol} with USDG</option><option value="sell">Sell {symbol} for USDG</option></select><label htmlFor="trade-input">Exact input ({direction === "buy" ? "USDG" : symbol})</label><input id="trade-input" inputMode="decimal" value={amount} disabled={busy} onChange={(event) => { editInput(); setAmount(event.target.value); }} /></div>
      <div className="route-controls"><label htmlFor="execution-wallet">Wallet</label><select id="execution-wallet" value={walletId} disabled={busy || !!account} onChange={(event) => setWalletId(event.target.value)}>{wallets.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div><div className="workflow-actions"><button type="button" onClick={connect} disabled={busy}>{account ? `${account.slice(0, 8)}…${account.slice(-6)}` : "Connect wallet"}</button><button type="button" onClick={check} disabled={busy || !account}>Get estimate and review checks</button></div>
      <p className="workflow-message" role="status" aria-live="polite">{busy ? "Request in progress. Check your wallet if a signature is required." : message}</p>
      {result ? <><div className="route-numbers"><div><span>Indicative output / {result.quote.state}</span><strong>{result.quote.outputAmount ? `${formatUnits(BigInt(result.quote.outputAmount), direction === "buy" ? 18 : 6)} ${direction === "buy" ? symbol : "USDG"}` : "Unavailable"}</strong></div><div><span>Trade safety result</span><strong>{expired && result.decision.status === "eligible" ? "Expired; recheck" : result.decision.status}</strong></div></div><details className="source-details"><summary>Estimate details, fees, and evidence <InfoTip label="Evidence">A record of the sources and safety checks for this amount. Quotes expire and must be checked again before signing.</InfoTip></summary><div className="source-meta"><span>Checked: {result.quote.checkedAt}</span><span>Expires: {result.quote.expiresAt || "unavailable"}</span><span>Provider observation time: unavailable</span><span>Minimum output: {result.quote.outputAmount ? formatUnits(BigInt(result.quote.outputAmount) * BigInt(9950) / BigInt(10000), direction === "buy" ? 18 : 6) : "Unavailable"} · 0.5% maximum slippage</span><span>Estimated network fee: {result.transaction ? `${formatEther(BigInt(result.transaction.estimatedFeeWei))} ETH` : "Unavailable until simulation"}</span><span>Execution network: {result.network ? `Testnet ${result.network.chainId}` : "Unavailable; mainnet research only"}</span>{result.network ? <><span>Testnet stock token: {result.network.stockToken}</span><span>Testnet stablecoin: {result.network.stablecoin}</span></> : null}<span>Execution target: {result.transaction?.to || result.approval?.spender || "Unconfigured / unverified"}</span><span>Evidence: {result.decision.evidenceHash}</span></div></details><ul className="policy-checks">{result.decision.checks.map((check) => <li key={check.code}><div><strong>{policyLanguage(check.code)[0]}</strong><p>{policyLanguage(check.code)[1]}</p><details className="source-details"><summary>Technical details</summary><p>{check.detail}</p><code>{check.code}</code></details></div><span className={`status-badge ${check.status === "pass" ? "status-ready" : check.status === "fail" ? "status-blocked" : "status-review"}`}>{check.status === "pass" ? "Passed" : check.status === "fail" ? "Blocked" : "Needs review"}</span></li>)}</ul><div className="workflow-actions">{result.approval ? <button type="button" disabled={busy} onClick={approve}>Approve this amount</button> : null}<button type="button" disabled={busy || expired || result.decision.status !== "eligible" || !result.transaction} onClick={execute}>Review in wallet and submit</button><a href={`/api/evidence/${result.decision.evidenceHash}`}>Export evidence</a></div></> : null}
      {pendingTrades.length ? <div className="transaction-history"><h3>Saved transaction references</h3>{pendingTrades.map((trade) => <div key={trade.hash} className="event-evidence"><a className="external-link" href={`${trade.explorer || "https://robinhoodchain.blockscout.com"}/tx/${trade.hash}`} target="_blank" rel="noopener noreferrer">{trade.hash.slice(0, 12)}…{trade.hash.slice(-8)}</a><span className="cell-meta">{trade.state}</span><div className="workflow-actions"><button type="button" disabled={busy} onClick={() => reconcile(trade)}>Check transaction receipt</button><a href={`/api/evidence/${trade.evidenceHash}`}>Export evidence</a></div></div>)}</div> : null}
    </section>
    <section className="detail-card" aria-labelledby="analyst-title"><div className="card-header"><div><span className="section-kicker">EVIDENCE EXPLANATION</span><h2 id="analyst-title">Analyst</h2></div><span className="card-tag">TOKENROUTER</span></div><p className="card-intro">Explain the sourced record or latest policy evidence. AI cannot approve or execute a trade. The application budget is $1 per month, shared across all accounts.</p><div className="workflow-actions"><button type="button" disabled={busy} onClick={explain}>Explain this evidence</button></div>{analyst ? analyst.state === "available" ? <><p className="explanation-text">{analyst.text}</p><div className="source-meta">{analyst.references.map((reference) => <a key={reference.id} href={reference.url} target="_blank" rel="noopener noreferrer">[{reference.id}] {reference.label}</a>)}<span>{analyst.cached ? "Cached explanation" : "Generated explanation"} · verify against the sources</span></div></> : <p className="workflow-message" role="status">{analyst.message}</p> : null}</section>
  </>;
}
