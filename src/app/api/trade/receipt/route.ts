import { createPublicClient, http, keccak256 } from "viem";
import { readEvidence, saveReceipt } from "@/lib/evidence-store";
import { reconcileLogs } from "@/lib/receipt-verification";
import { loadManifest } from "@/lib/execution";
import { robinhoodRpc, usdgAddress } from "@/lib/robinhood-data";
import { record } from "@/lib/observations";
import { guardRequest, readSmallBody } from "@/lib/request-guard";
import { testnetRpc } from "@/lib/testnet-execution";
import { executionChainAllowed } from "@/lib/execution-network";

async function handlePOST(request: Request) {
  const denied = await guardRequest(request, "receipts", 30);
  if (denied) return denied;
  const input = record(await readSmallBody(request).catch(() => null));
  if (!input || typeof input.hash !== "string" || typeof input.evidenceHash !== "string" || !/^0x[\da-f]{64}$/i.test(input.hash) || !/^0x[\da-f]{64}$/i.test(input.evidenceHash)) return Response.json({ error: "Invalid transaction reference" }, { status: 400 });
  const stored = await readEvidence(input.evidenceHash);
  if (stored?.evidence.testnet) {
    const binding = stored.evidence.testnet;
    if (!executionChainAllowed(binding.chainId)) return Response.json({ error: "Mainnet receipt rejected" }, { status: 400 });
    const client = createPublicClient({ transport: http(testnetRpc(binding.chainId), { retryCount: 0, timeout: 7000 }) });
    try {
      if (await client.getChainId() !== binding.chainId) throw new Error("wrong_chain");
      const receipt = await client.getTransactionReceipt({ hash: input.hash as `0x${string}` });
      if (receipt.to?.toLowerCase() !== binding.executor.toLowerCase() || receipt.from.toLowerCase() !== binding.user.toLowerCase()) return Response.json({ error: "Transaction target or wallet mismatch" }, { status: 400 });
      const code = await client.getCode({ address: binding.executor as `0x${string}`, blockNumber: receipt.blockNumber });
      if (!code || keccak256(code) !== binding.executorCodeHash) return Response.json({ error: "Historical executor code mismatch" }, { status: 400 });
      const direction = stored.evidence.direction;
      const outputAmount = reconcileLogs(receipt.logs, binding.executor as `0x${string}`, receipt.from, input.evidenceHash, (direction === "buy" ? binding.stablecoin : binding.stockToken) as `0x${string}`, (direction === "buy" ? binding.stockToken : binding.stablecoin) as `0x${string}`, stored.evidence.inputAmount);
      const result = { hash: input.hash, state: receipt.status === "reverted" ? "reverted" : outputAmount ? "confirmed" : "unreconciled", block: receipt.blockNumber.toString(), inputAmount: stored.evidence.inputAmount, outputAmount, gasUsed: receipt.gasUsed.toString() };
      await saveReceipt(input.evidenceHash, result);
      return Response.json(result);
    } catch { return Response.json({ state: "pending", message: "Testnet receipt unavailable; retry reconciliation." }); }
  }
  const manifest = await loadManifest();
  if (!stored || !manifest) return Response.json({ error: "Evidence or deployment unavailable" }, { status: 404 });
  const client = createPublicClient({ transport: http(robinhoodRpc, { retryCount: 0, timeout: 7000 }) });
  try {
    if (await client.getChainId() !== 4663) throw new Error("wrong_chain");
    const receipt = await client.getTransactionReceipt({ hash: input.hash as `0x${string}` });
    if (receipt.to?.toLowerCase() !== manifest.executor.toLowerCase()) return Response.json({ error: "Transaction target mismatch" }, { status: 400 });
    const code = await client.getCode({ address: manifest.executor, blockNumber: receipt.blockNumber });
    if (!code || keccak256(code) !== manifest.executorCodeHash) return Response.json({ error: "Historical executor code mismatch" }, { status: 400 });
    const identity = "value" in stored.evidence.asset.identity ? stored.evidence.asset.identity.value : null;
    const outputAmount = identity ? reconcileLogs(receipt.logs, manifest.executor, receipt.from, input.evidenceHash, stored.evidence.direction === "buy" ? usdgAddress : identity.contract, stored.evidence.direction === "buy" ? identity.contract : usdgAddress, stored.evidence.inputAmount) : null;
    const state = receipt.status === "reverted" ? "reverted" : outputAmount ? "confirmed" : "unreconciled";
    const result = { hash: input.hash, state, block: receipt.blockNumber.toString(), inputAmount: stored.evidence.inputAmount, outputAmount, gasUsed: receipt.gasUsed.toString() };
    await saveReceipt(input.evidenceHash, result);
    return Response.json(result);
  } catch { return Response.json({ state: "pending", message: "Receipt unavailable; retry reconciliation." }, { headers: { "Cache-Control": "no-store" } }); }
}
import { privateRoute } from "@/lib/account-access";
export const POST = privateRoute(handlePOST, true);
