"use client";

import { useEffect, useState } from "react";
import { executionChainAllowed } from "@/lib/execution-network";
import { discoverWallets, requestAccounts, type WalletOption } from "@/lib/evm-wallet";

type DeploymentRequest = { label: string; from: `0x${string}`; to?: `0x${string}`; data: `0x${string}`; value: "0x0"; chainId: string };
export function DeploymentWorkspace() {
  const [requests, setRequests] = useState<DeploymentRequest[]>([]);
  const [message, setMessage] = useState("Prepare unsigned deployment requests locally. Each request requires its own wallet review and signature.");
  const [busy, setBusy] = useState(false);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletId, setWalletId] = useState("");
  useEffect(() => {
    let active = true;
    void discoverWallets().then((options) => { if (active) { setWallets(options); setWalletId(options[0]?.id || ""); } });
    return () => { active = false; };
  }, []);
  async function load() {
    setBusy(true);
    try { const response = await fetch("/api/deployment", { cache: "no-store" }); const result = await response.json(); if (!response.ok) { setMessage(result.message); return; } setRequests(result.requests); }
    catch { setMessage("Deployment requests could not be loaded."); }
    finally { setBusy(false); }
  }
  async function submit(item: DeploymentRequest) {
    setBusy(true);
    try {
      const provider = wallets.find((option) => option.id === walletId)?.provider;
      if (!provider) throw new Error("Wallet unavailable");
      if (!executionChainAllowed(Number(item.chainId))) throw new Error("Mainnet deployment requests are disabled");
      const accounts = await requestAccounts(provider);
      if (Number(await provider.request({ method: "eth_chainId" })) !== Number(item.chainId)) throw new Error(`Switch the wallet to testnet chain ${Number(item.chainId)} first`);
      if (accounts[0]?.toLowerCase() !== item.from.toLowerCase()) throw new Error("Connect the configured deployment owner");
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: item.from, to: item.to, data: item.data, value: item.value }] });
      setMessage(`Submitted ${item.label}: ${hash}. Confirm the receipt and deployed address before preparing the next stage.`);
    } catch (error) { setMessage((error as { code?: number })?.code === 4001 ? "Wallet request rejected." : (error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="detail-card"><h2>Unsigned testnet deployment requests</h2><p className="workflow-message" role="status">{message}</p><div className="route-controls"><label htmlFor="deployment-wallet">Deployment wallet</label><select id="deployment-wallet" value={walletId} onChange={(event) => setWalletId(event.target.value)} disabled={busy}>{wallets.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div><div className="workflow-actions"><button type="button" onClick={load} disabled={busy}>Load prepared requests</button></div>{requests.map((item, index) => <article className="event-evidence" key={`${item.label}:${index}`}><strong>{index + 1}. {item.label}</strong><span className="cell-meta">Owner: {item.from}</span><span className="cell-meta">Target: {item.to || "New contract"} · Testnet chain: {Number(item.chainId)} · ETH transfer: zero plus network fees</span><div className="workflow-actions"><button type="button" onClick={() => submit(item)} disabled={busy}>Review request in wallet</button></div></article>)}</section>;
}
