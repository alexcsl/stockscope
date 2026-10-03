"use client";

import { useEffect, useState } from "react";
import { createPublicClient, custom, encodeFunctionData, parseAbi, type EIP1193Provider } from "viem";
import type { DemoStatus } from "@/lib/demo-status";
import { requestAccounts } from "@/lib/evm-wallet";

export function DemoExecutionStatus({ account, provider, onRefresh }: { account: `0x${string}` | null; provider: () => EIP1193Provider | undefined; onRefresh: () => void }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/execution/status", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value) => { if (active) setStatus(value); }).catch(() => { if (active) setMessage("Demo status is unavailable."); });
    return () => { active = false; };
  }, []);
  async function refresh() {
    if (!status || !("owner" in status)) return;
    setBusy(true);
    try {
      const wallet = provider();
      if (!wallet || Number(await wallet.request({ method: "eth_chainId" })) !== 421614) throw new Error("Connect the demo owner on Arbitrum Sepolia.");
      const accounts = await requestAccounts(wallet);
      if (accounts[0]?.toLowerCase() !== status.owner.toLowerCase()) throw new Error("Only the demo owner can refresh the test feeds.");
      if (Number(await wallet.request({ method: "eth_chainId" })) !== 421614) throw new Error("Wallet network changed. Reconnect on Arbitrum Sepolia.");
      const data = encodeFunctionData({ abi: parseAbi(["function refreshFeeds()"]), functionName: "refreshFeeds" });
      const hash = await wallet.request({ method: "eth_sendTransaction", params: [{ from: status.owner, to: status.controller, data, value: "0x0" }] }) as `0x${string}`;
      setMessage("Refresh submitted. Waiting for the testnet receipt.");
      const receipt = await createPublicClient({ transport: custom(wallet) }).waitForTransactionReceipt({ hash, timeout: 60000 });
      if (receipt.status !== "success") throw new Error("Feed refresh reverted. Trading remains blocked.");
      setStatus(await (await fetch("/api/execution/status", { cache: "no-store" })).json());
      onRefresh();
      setMessage("Fixed demo feeds refreshed. Request a new trade check.");
    } catch (error) { setMessage((error as { code?: number }).code === 4001 ? "Refresh cancelled in wallet." : (error as Error).message); }
    finally { setBusy(false); }
  }
  if (!status || status.state === "unconfigured") return message ? <p className="cell-meta">{message}</p> : null;
  return <div className="event-evidence"><strong>Arbitrum Sepolia demo</strong><p className="cell-meta">DEMO-AAPL and DEMO-USDG have no monetary value. Prices are fixed test values, including a synthetic sequencer feed. Research prices remain separate.</p><p className="cell-meta">{status.message}</p>{"owner" in status ? <><p className="cell-meta">Available: {status.symbols.join(", ")}. The deployment owner receives the initial demo tokens; other wallets need an owner transfer.</p><a className="external-link" href={`${status.explorer}/address/${status.executor}`} target="_blank" rel="noopener noreferrer">View executor on explorer</a>{account?.toLowerCase() === status.owner.toLowerCase() ? <div className="workflow-actions"><button type="button" onClick={refresh} disabled={busy}>Review demo feed refresh in wallet</button></div> : null}</> : null}<p className="cell-meta" role="status">{message}</p></div>;
}
