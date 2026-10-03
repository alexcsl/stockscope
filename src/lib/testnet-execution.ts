import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, encodeAbiParameters, encodeFunctionData, erc20Abi, http, keccak256, pad, parseAbi, type Address, type Hex, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { executionChainAllowed } from "./execution-network";
import { executorAbi, orderTypes, type TradePreparation } from "./execution-abi";
import { evaluatePolicy, hashEvidence, type PolicyEvidence } from "./policy";
import { saveEvidence } from "./evidence-store";
import { record, address } from "./observations";
import type { SourcedAsset } from "./robinhood-data";

interface Binding { address: Address; codeHash: Hex; sourceUrl: string }
export interface TestnetManifest {
  chainId: 421614 | 46630;
  executor: Binding;
  stablecoin: Binding;
  sequencer: Binding;
  assets: { symbol: string; assetKey: string; token: Binding; protocol: 3 | 4; adapter: Binding; venue: Binding; factory?: Binding; quoter: Binding; poolId: Hex; fee: number; tickSpacing: number; oracles: { token: Address; feed: Binding; maxAge: number }[] }[];
}
const validBinding = (value: unknown): value is Binding => { const item = record(value); return Boolean(item && address(item.address) && !/^0x0{40}$/i.test(String(item.address)) && /^0x[\da-f]{64}$/i.test(String(item.codeHash)) && typeof item.sourceUrl === "string" && item.sourceUrl.startsWith("https://")); };
export function validTestnetManifest(value: unknown): value is TestnetManifest {
  const item = record(value);
  if (!item || typeof item.chainId !== "number" || !executionChainAllowed(item.chainId) || !validBinding(item.executor) || !validBinding(item.stablecoin) || !validBinding(item.sequencer) || !Array.isArray(item.assets) || !item.assets.length) return false;
  return item.assets.every((raw) => {
    const asset = record(raw);
    return asset && ["AAPL", "NVDA", "TSLA"].includes(String(asset.symbol)) && /^robinhood:4663:0x[\da-f]{40}$/i.test(String(asset.assetKey)) && validBinding(asset.token) && [3, 4].includes(Number(asset.protocol)) && validBinding(asset.adapter) && validBinding(asset.venue) && validBinding(asset.quoter) && (asset.protocol !== 3 || validBinding(asset.factory)) && /^0x[\da-f]{64}$/i.test(String(asset.poolId)) && Number.isInteger(asset.fee) && Number(asset.fee) >= 0 && Number(asset.fee) < 1000000 && Number.isInteger(asset.tickSpacing) && (asset.protocol === 3 ? asset.tickSpacing === 0 : Number(asset.tickSpacing) > 0 && Number(asset.tickSpacing) <= 32767) && Array.isArray(asset.oracles) && asset.oracles.length === 2 && asset.oracles.every((rawOracle) => { const oracle = record(rawOracle); return oracle && address(oracle.token) && validBinding(oracle.feed) && Number.isInteger(oracle.maxAge) && Number(oracle.maxAge) > 0 && Number(oracle.maxAge) <= 3600; });
  });
}
export async function loadTestnetManifest(): Promise<TestnetManifest | null> {
  try { const value = JSON.parse(process.env.STOCKSCOPE_TESTNET_MANIFEST || await readFile(join(process.cwd(), ".stockscope", "testnet-execution.json"), "utf8")); return validTestnetManifest(value) ? value : null; } catch { return null; }
}
export const testnetRpc = (chainId: number) => chainId === 421614 ? process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc" : process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
export const testnetExplorer = (chainId: number) => chainId === 421614 ? "https://sepolia.arbiscan.io" : "https://explorer.testnet.chain.robinhood.com";

export async function prepareTestnetTrade(manifest: TestnetManifest, research: SourcedAsset, direction: "buy" | "sell", inputAmount: string, user: Address, options: { transport?: Transport; signerKey?: Hex; persist?: typeof saveEvidence; onFailure?: (error: unknown) => void; now?: () => Date } = {}): Promise<TradePreparation> {
  const now = options.now || (() => new Date());
  const asset = manifest.assets.find((item) => item.symbol === research.symbol);
  if (!asset || !validTestnetManifest(manifest)) throw new Error("testnet_asset_unconfigured");
  const client = createPublicClient({ transport: options.transport || http(testnetRpc(manifest.chainId), { timeout: 7000, retryCount: 0 }) });
  const input = direction === "buy" ? manifest.stablecoin.address : asset.token.address;
  const output = direction === "buy" ? asset.token.address : manifest.stablecoin.address;
  const evidence: PolicyEvidence = { version: 1, symbol: research.symbol, direction, inputAmount, asset: research, evaluatedAt: now().toISOString(), executionConfigured: true, deploymentVerified: false, simulated: false, inputUsd18: null, poolAllowed: false, quote: { state: "no_route", checkedAt: now().toISOString(), sizeUsd: 0, symbol: research.symbol, direction, inputAmount, tokenAddress: asset.token.address, stablecoinAddress: manifest.stablecoin.address }, testnet: { chainId: manifest.chainId, user, executor: manifest.executor.address, executorCodeHash: manifest.executor.codeHash, stockToken: asset.token.address, stablecoin: manifest.stablecoin.address, assetKey: asset.assetKey, sourceUrls: [asset.token.sourceUrl, asset.venue.sourceUrl, asset.quoter.sourceUrl, ...asset.oracles.map((oracle) => oracle.feed.sourceUrl)], checks: [] } };
  let approval: TradePreparation["approval"] = null;
  let transaction: TradePreparation["transaction"] = null;
  let message = "Testnet integration is unavailable. Inspect the verified bindings and policy checks.";
  try {
    const chainId = await client.getChainId();
    if (!executionChainAllowed(chainId) || chainId !== manifest.chainId) throw new Error("wrong_chain");
    for (const binding of [manifest.executor, manifest.stablecoin, manifest.sequencer, asset.token, asset.adapter, asset.venue, asset.quoter, ...(asset.factory ? [asset.factory] : []), ...asset.oracles.map((oracle) => oracle.feed)]) {
      const code = await client.getCode({ address: binding.address });
      if (!code || code === "0x" || keccak256(code) !== binding.codeHash) throw new Error("code_binding_mismatch");
    }
    if (research.identity.state !== "available" || research.chain.state !== "available" || asset.assetKey !== `robinhood:4663:${research.identity.value.contract.toLowerCase()}`) throw new Error("research_identity_mismatch");
    const key = options.signerKey || process.env.POLICY_SIGNER_PRIVATE_KEY || (await readFile(join(process.cwd(), ".stockscope", "policy-signer.key"), "utf8").catch(() => "")).trim();
    if (!/^0x[\da-f]{64}$/i.test(key)) throw new Error("policy_signer_unconfigured");
    const signer = privateKeyToAccount(key as Hex);
    const read = <T extends "paused" | "policySigner" | "usdg" | "sequencer" | "configEpoch">(functionName: T) => client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName });
    const [paused, configuredSigner, stablecoin, sequencer, epoch, nonce, adapter, stockDecimals, stableDecimals] = await Promise.all([read("paused"), read("policySigner"), read("usdg"), read("sequencer"), read("configEpoch"), client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName: "nonces", args: [user] }), client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName: "adapters", args: [asset.protocol] }), client.readContract({ address: asset.token.address, abi: erc20Abi, functionName: "decimals" }), client.readContract({ address: manifest.stablecoin.address, abi: erc20Abi, functionName: "decimals" })]);
    if (paused || configuredSigner.toLowerCase() !== signer.address.toLowerCase() || stablecoin.toLowerCase() !== manifest.stablecoin.address.toLowerCase() || sequencer.toLowerCase() !== manifest.sequencer.address.toLowerCase() || adapter.toLowerCase() !== asset.adapter.address.toLowerCase() || stockDecimals !== 18 || stableDecimals !== 6) throw new Error("executor_binding_mismatch");
    const adapterAbi = parseAbi(["function executor() view returns (address)", "function router() view returns (address)", "function factory() view returns (address)", "function manager() view returns (address)"]);
    const adapterOwner = await client.readContract({ address: adapter, abi: adapterAbi, functionName: "executor" });
    const venue = await client.readContract({ address: adapter, abi: adapterAbi, functionName: asset.protocol === 3 ? "router" : "manager" });
    if (adapterOwner.toLowerCase() !== manifest.executor.address.toLowerCase() || venue.toLowerCase() !== asset.venue.address.toLowerCase()) throw new Error("venue_binding_mismatch");
    for (const token of [input, output]) {
      const oracle = asset.oracles.find((item) => item.token.toLowerCase() === token.toLowerCase());
      if (!oracle) throw new Error("oracle_missing");
      const binding = await client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName: "oracles", args: [token] });
      if (binding[0].toLowerCase() !== oracle.feed.address.toLowerCase() || binding[1] !== oracle.maxAge) throw new Error("oracle_binding_mismatch");
    }
    const poolKey = keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "uint24" }, { type: "int24" }], [asset.protocol, asset.poolId, asset.fee, asset.tickSpacing]));
    if (!await client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName: "allowedPools", args: [poolKey] })) throw new Error("pool_not_allowlisted");
    const multiplier = await client.readContract({ address: asset.token.address, abi: parseAbi(["function uiMultiplier() view returns (uint256)"]), functionName: "uiMultiplier" });
    if (multiplier <= BigInt(0)) throw new Error("invalid_multiplier");
    const inputValue = await client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName: "inputValue", args: [input, BigInt(inputAmount)] });
    await client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName: "inputValue", args: [output, direction === "buy" ? BigInt(10) ** BigInt(18) : BigInt(10) ** BigInt(6)] });
    if (inputValue <= BigInt(0) || inputValue > BigInt(10) ** BigInt(19)) throw new Error("amount_limit");
    let outputAmount: bigint;
    if (asset.protocol === 3) {
      const factory = await client.readContract({ address: adapter, abi: adapterAbi, functionName: "factory" });
      if (factory.toLowerCase() !== asset.factory!.address.toLowerCase()) throw new Error("factory_mismatch");
      const pool = await client.readContract({ address: factory, abi: parseAbi(["function getPool(address,address,uint24) view returns (address)"]), functionName: "getPool", args: [input, output, asset.fee] });
      if (pad(pool).toLowerCase() !== asset.poolId.toLowerCase()) throw new Error("pool_mismatch");
      const quote = await client.simulateContract({ address: asset.quoter.address, abi: parseAbi(["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256,uint160,uint32,uint256)"]), functionName: "quoteExactInputSingle", args: [{ tokenIn: input, tokenOut: output, amountIn: BigInt(inputAmount), fee: asset.fee, sqrtPriceLimitX96: BigInt(0) }] });
      outputAmount = quote.result[0];
    } else {
      const [currency0, currency1] = [input, output].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const hooks = "0x0000000000000000000000000000000000000000" as Address;
      const key = { currency0, currency1, fee: asset.fee, tickSpacing: asset.tickSpacing, hooks };
      const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [currency0, currency1, asset.fee, asset.tickSpacing, hooks]));
      if (id !== asset.poolId || BigInt(inputAmount) >= BigInt(2) ** BigInt(128)) throw new Error("v4_pool_mismatch");
      const quote = await client.simulateContract({ address: asset.quoter.address, abi: parseAbi(["function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256,uint256)"]), functionName: "quoteExactInputSingle", args: [{ poolKey: key, zeroForOne: input.toLowerCase() === currency0.toLowerCase(), exactAmount: BigInt(inputAmount), hookData: "0x" }] });
      outputAmount = quote.result[0];
    }
    if (outputAmount <= BigInt(0)) throw new Error("empty_quote");
    evidence.quote = { ...evidence.quote, state: "available", checkedAt: now().toISOString(), expiresAt: new Date(now().getTime() + 15000).toISOString(), outputAmount: outputAmount.toString(), routing: "CLASSIC", pool: { protocol: asset.protocol, id: asset.poolId, fee: asset.fee, tickSpacing: asset.tickSpacing, hooks: "0x0000000000000000000000000000000000000000" } };
    evidence.deploymentVerified = true; evidence.poolAllowed = true; evidence.inputUsd18 = inputValue.toString();
    evidence.testnet!.checks.push({ code: "deployment", status: "pass", detail: "Testnet executor, token, adapter, pool, feeds, and signer bindings verified." }, { code: "amount_limit", status: "pass", detail: "Testnet oracle input value is at most $10. Testnet tokens have no monetary value." });
    approval = { token: input, spender: manifest.executor.address, amount: inputAmount };
    evidence.evaluatedAt = now().toISOString();
    const finalEvidence = { ...evidence, simulated: true };
    const order = { user, input, output, asset: asset.token.address, amountIn: BigInt(inputAmount), minOut: outputAmount * BigInt(9950) / BigInt(10000), protocol: asset.protocol, poolId: asset.poolId, fee: asset.fee, tickSpacing: asset.tickSpacing, multiplier, nonce, deadline: BigInt(Math.floor(Date.parse(evidence.quote.expiresAt!) / 1000)), policyVersion: BigInt(1), configEpoch: epoch, evidenceHash: hashEvidence(finalEvidence) };
    const signature = await signer.signTypedData({ domain: { name: "StockScope", version: "1", chainId: manifest.chainId, verifyingContract: manifest.executor.address }, types: orderTypes, primaryType: "TradeOrder", message: order });
    await client.simulateContract({ account: user, address: manifest.executor.address, abi: executorAbi, functionName: "execute", args: [order, signature] });
    const data = encodeFunctionData({ abi: executorAbi, functionName: "execute", args: [order, signature] });
    const gas = await client.estimateGas({ account: user, to: manifest.executor.address, data });
    transaction = { to: manifest.executor.address, data, value: "0x0", gas: gas.toString(), estimatedFeeWei: (gas * await client.getGasPrice()).toString() };
    evidence.simulated = true;
    message = "Testnet executor simulation passed. Review the token addresses and exact amount in your wallet before signing.";
  } catch (error) {
    options.onFailure?.(error);
    if (!approval) evidence.testnet!.checks.push({ code: "deployment", status: "fail", detail: "A testnet identity, code, adapter, oracle, pool, signer, or amount binding failed verification." });
    message = approval ? "Testnet executor simulation is incomplete. Approve the exact input only, then request a fresh check. A reverted simulation is not an execution approval." : message;
  }
  if (evidence.quote.expiresAt && Date.parse(evidence.quote.expiresAt) <= now().getTime()) { evidence.evaluatedAt = now().toISOString(); evidence.simulated = false; transaction = null; }
  const decision = evaluatePolicy(evidence);
  if (decision.status !== "eligible") transaction = null;
  await (options.persist || saveEvidence)(evidence, decision);
  return { network: { chainId: manifest.chainId, explorer: testnetExplorer(manifest.chainId), testnet: true, stockToken: asset.token.address, stablecoin: manifest.stablecoin.address }, decision, quote: evidence.quote, approval, transaction, message };
}
