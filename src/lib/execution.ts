import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, encodeAbiParameters, encodeFunctionData, http, keccak256, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { address, record } from "./observations";
import { getSourcedAsset, robinhoodRpc, usdgAddress } from "./robinhood-data";
import { getUniswapRoute } from "./uniswap-route";
import { executorAbi, orderTypes, type TradePreparation } from "./execution-abi";
import { evaluatePolicy, hashEvidence, type PolicyEvidence } from "./policy";
import { saveEvidence } from "./evidence-store";
import { executionChainAllowed } from "./execution-network";
import { loadTestnetManifest, prepareTestnetTrade } from "./testnet-execution";

interface Manifest {
  chainId: 4663;
  executor: Address;
  executorCodeHash: Hex;
  sequencer: Address;
  adapters: { protocol: 3 | 4; address: Address; codeHash: Hex }[];
  oracles: { token: Address; feed: Address; feedCodeHash: Hex; maxAge: number }[];
  pools: { protocol: 3 | 4; id: Hex; fee: number; tickSpacing: number }[];
}

export async function loadManifest(): Promise<Manifest | null> {
  try {
    const value = record(JSON.parse(await readFile(join(process.cwd(), ".stockscope", "execution.json"), "utf8")));
    if (!value || value.chainId !== 4663 || !address(value.executor) || !address(value.sequencer) || !/^0x[\da-f]{64}$/i.test(String(value.executorCodeHash)) || !Array.isArray(value.adapters) || !Array.isArray(value.oracles) || !Array.isArray(value.pools)) return null;
    if (!value.adapters.every((item) => { const a = record(item); return a && [3, 4].includes(Number(a.protocol)) && address(a.address) && /^0x[\da-f]{64}$/i.test(String(a.codeHash)); })) return null;
    if (!value.oracles.every((item) => { const a = record(item); return a && address(a.token) && address(a.feed) && /^0x[\da-f]{64}$/i.test(String(a.feedCodeHash)) && Number.isInteger(a.maxAge) && Number(a.maxAge) > 0 && Number(a.maxAge) <= 3600; })) return null;
    if (!value.pools.every((item) => { const p = record(item); return p && [3, 4].includes(Number(p.protocol)) && /^0x[\da-f]{64}$/i.test(String(p.id)) && Number.isInteger(p.fee) && Number(p.fee) >= 0 && Number(p.fee) < 1000000 && Number.isInteger(p.tickSpacing) && (p.protocol === 3 ? p.tickSpacing === 0 : Number(p.tickSpacing) > 0 && Number(p.tickSpacing) <= 32767); })) return null;
    return value as unknown as Manifest;
  } catch { return null; }
}

export async function prepareTrade(symbol: string, direction: "buy" | "sell", inputAmount: string, user: Address): Promise<TradePreparation> {
  const asset = await getSourcedAsset(symbol);
  const testnetManifest = await loadTestnetManifest();
  if (testnetManifest?.assets.some((item) => item.symbol === symbol)) return prepareTestnetTrade(testnetManifest, asset, direction, inputAmount, user);
  const quote = await getUniswapRoute(symbol, 10, user, process.env.UNISWAP_API_KEY, fetch, () => new Date(), { direction, inputAmount, protocols: ["V3", "V4"] });
  const manifest = await loadManifest();
  const executionAllowed = executionChainAllowed(4663);
  const key = process.env.POLICY_SIGNER_PRIVATE_KEY || (await readFile(join(process.cwd(), ".stockscope", "policy-signer.key"), "utf8").catch(() => "")).trim();
  const signer = key && /^0x[\da-f]{64}$/i.test(key) ? privateKeyToAccount(key as Hex) : null;
  const client = createPublicClient({ transport: http(robinhoodRpc, { timeout: 7000, retryCount: 0 }) });
  const identity = "value" in asset.identity ? asset.identity.value : null;
  const pool = quote.pool;
  const input = direction === "buy" ? usdgAddress : identity?.contract;
  const output = direction === "buy" ? identity?.contract : usdgAddress;
  const evidence: PolicyEvidence = { version: 1, symbol, direction, inputAmount, asset, quote, evaluatedAt: new Date().toISOString(), executionConfigured: Boolean(executionAllowed && manifest && signer), deploymentVerified: false, simulated: false, inputUsd18: null, poolAllowed: false };
  let approval: TradePreparation["approval"] = null;
  let transaction: TradePreparation["transaction"] = null;
  let message = "Testnet-only mode: Robinhood mainnet quotes are research evidence. Mainnet approvals and execution are disabled. A verified testnet token, pool, feeds, and executor are required for wallet settlement.";
  if (executionAllowed && manifest && signer && identity && pool && input && output) {
    try {
      const read = <T extends "configEpoch" | "paused" | "policySigner" | "usdg" | "sequencer">(functionName: T) => client.readContract({ address: manifest.executor, abi: executorAbi, functionName });
      const [chain, code, paused, signerAddress, stablecoin, sequencer, epoch, nonce] = await Promise.all([
        client.getChainId(), client.getCode({ address: manifest.executor }), read("paused"), read("policySigner"), read("usdg"), read("sequencer"), read("configEpoch"),
        client.readContract({ address: manifest.executor, abi: executorAbi, functionName: "nonces", args: [user] }),
      ]);
      const adapterConfig = manifest.adapters.find((item) => item.protocol === pool.protocol);
      if (chain !== 4663 || !code || keccak256(code) !== manifest.executorCodeHash || paused || signerAddress.toLowerCase() !== signer.address.toLowerCase() || stablecoin.toLowerCase() !== usdgAddress.toLowerCase() || sequencer.toLowerCase() !== manifest.sequencer.toLowerCase() || !adapterConfig) throw new Error("deployment_mismatch");
      const adapter = await client.readContract({ address: manifest.executor, abi: executorAbi, functionName: "adapters", args: [pool.protocol] });
      const adapterCode = await client.getCode({ address: adapter });
      if (adapter.toLowerCase() !== adapterConfig.address.toLowerCase() || !adapterCode || keccak256(adapterCode) !== adapterConfig.codeHash) throw new Error("adapter_mismatch");
      for (const token of [input, output]) {
        const config = manifest.oracles.find((item) => item.token.toLowerCase() === token.toLowerCase());
        if (!config) throw new Error("oracle_unverified");
        const oracle = await client.readContract({ address: manifest.executor, abi: executorAbi, functionName: "oracles", args: [token] });
        const code = await client.getCode({ address: config.feed });
        if (oracle[0].toLowerCase() !== config.feed.toLowerCase() || oracle[1] !== config.maxAge || !code || keccak256(code) !== config.feedCodeHash) throw new Error("oracle_binding_mismatch");
      }
      evidence.deploymentVerified = true;
      evidence.inputUsd18 = (await client.readContract({ address: manifest.executor, abi: executorAbi, functionName: "inputValue", args: [input, BigInt(inputAmount)] })).toString();
      const poolKey = keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "uint24" }, { type: "int24" }], [pool.protocol, pool.id, pool.fee, pool.tickSpacing]));
      evidence.poolAllowed = manifest.pools.some((item) => item.protocol === pool.protocol && item.id.toLowerCase() === pool.id.toLowerCase() && item.fee === pool.fee && item.tickSpacing === pool.tickSpacing) && await client.readContract({ address: manifest.executor, abi: executorAbi, functionName: "allowedPools", args: [poolKey] });
      evidence.evaluatedAt = new Date().toISOString();
      const preview = evaluatePolicy({ ...evidence, simulated: true });
      if (preview.status !== "eligible" || !quote.outputAmount || !quote.expiresAt) throw new Error("policy_rejected");
      approval = { token: input, spender: manifest.executor, amount: inputAmount };
      const finalEvidence = { ...evidence, simulated: true };
      const order = { user, input, output, asset: identity.contract, amountIn: BigInt(inputAmount), minOut: BigInt(quote.outputAmount) * BigInt(9950) / BigInt(10000), protocol: pool.protocol, poolId: pool.id, fee: pool.fee, tickSpacing: pool.tickSpacing, multiplier: parseUnits(identity.multiplier, 18), nonce, deadline: BigInt(Math.floor(Date.parse(quote.expiresAt) / 1000)), policyVersion: BigInt(1), configEpoch: epoch, evidenceHash: hashEvidence(finalEvidence) };
      const signature = await signer.signTypedData({ domain: { name: "StockScope", version: "1", chainId: 4663, verifyingContract: manifest.executor }, types: orderTypes, primaryType: "TradeOrder", message: order });
      const data = encodeFunctionData({ abi: executorAbi, functionName: "execute", args: [order, signature] });
      await client.simulateContract({ account: user, address: manifest.executor, abi: executorAbi, functionName: "execute", args: [order, signature] });
      const gas = await client.estimateGas({ account: user, to: manifest.executor, data });
      const gasPrice = await client.getGasPrice();
      evidence.simulated = true;
      transaction = { to: manifest.executor, data, value: "0x0", gas: gas.toString(), estimatedFeeWei: (gas * gasPrice).toString() };
      message = "Policy passed and the current executor call simulated. Recheck immediately before signing; the quote expires in 15 seconds.";
    } catch {
      message = approval ? "Approval or simulation is incomplete. Approve only the exact input, then refresh the policy check." : "The route or deployment does not meet the execution policy. Inspect the checks below.";
    }
  } else if (quote.state === "available" && !pool) {
    message = "The provider returned a research quote, but its route is unsupported for guarded execution (hooks, dynamic fees, multiple pools, or an unsupported protocol).";
  }
  if (quote.expiresAt && Date.parse(quote.expiresAt) <= Date.now()) { evidence.evaluatedAt = new Date().toISOString(); evidence.simulated = false; transaction = null; }
  const decision = evaluatePolicy(evidence);
  if (decision.status !== "eligible") transaction = null;
  await saveEvidence(evidence, decision);
  return { decision, quote, approval, transaction, message };
}
