import fs from "node:fs";
import { createPublicClient, encodeDeployData, encodeFunctionData, http, isAddress, parseAbi, keccak256 } from "viem";
import { compileContracts } from "./compile-contracts.mjs";

const path = ".stockscope/deployment-input.json";
if (!fs.existsSync(path)) throw new Error("Create .stockscope/deployment-input.json using docs/operations/execution-setup.md. No transaction has been submitted.");
const config = JSON.parse(fs.readFileSync(path, "utf8"));
for (const field of ["owner", "policySigner", "usdg", "sequencer"]) if (!isAddress(config[field]) || /^0x0{40}$/i.test(config[field])) throw new Error(`Invalid ${field}`);
if (![421614, 46630].includes(config.chainId)) throw new Error("Deployment is restricted to Arbitrum Sepolia (421614) or Robinhood testnet (46630). Mainnet requests are disabled.");
const chainId = `0x${config.chainId.toString(16)}`;
const rpc = config.chainId === 421614 ? process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc" : process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const client = createPublicClient({ transport: http(rpc, { retryCount: 0, timeout: 10000 }) });
if (await client.getChainId() !== config.chainId) throw new Error("Wrong chain");
for (const field of ["usdg", "sequencer"]) if (!(await client.getCode({ address: config[field] }))) throw new Error(`Unverified ${field}`);
const contracts = compileContracts();
const find = (name) => Object.values(contracts).map((entries) => entries[name]).find(Boolean);
const requests = [];
function deploy(name, args) {
  const artifact = find(name);
  requests.push({ label: `Deploy ${name}`, chainId, from: config.owner, data: encodeDeployData({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args }), value: "0x0" });
}
if (!config.executor) {
  deploy("GuardedExecutor", [config.owner, config.policySigner, config.usdg, config.sequencer]);
} else {
  if (!isAddress(config.executor) || !(await client.getCode({ address: config.executor }))) throw new Error("Executor is not deployed");
  if (!config.v3Adapter && config.v3Router && config.v3Factory) deploy("V3Adapter", [config.executor, config.v3Router, config.v3Factory]);
  if (!config.v4Adapter && config.v4Manager) deploy("V4Adapter", [config.executor, config.v4Manager]);
  const artifact = find("GuardedExecutor");
  const call = (functionName, args) => requests.push({ label: functionName, chainId, from: config.owner, to: config.executor, data: encodeFunctionData({ abi: artifact.abi, functionName, args }), value: "0x0" });
  for (const [protocol, adapter] of [[3, config.v3Adapter], [4, config.v4Adapter]]) if (adapter) call("setAdapter", [protocol, adapter]);
  for (const oracle of config.oracles || []) {
    if (!isAddress(oracle.token) || !isAddress(oracle.feed) || !oracle.sourceUrl?.startsWith("https://")) throw new Error("Oracle source verification is required");
    const code = await client.getCode({ address: oracle.feed });
    if (!code || code === "0x") throw new Error("Oracle has no code");
    await client.readContract({ address: oracle.feed, abi: parseAbi(["function decimals() view returns (uint8)"]), functionName: "decimals" });
    call("setOracle", [oracle.token, oracle.feed, oracle.maxAge]);
  }
  for (const pool of config.pools || []) {
    if (!pool.sourceUrl?.startsWith("https://")) throw new Error("Pool source verification is required");
    call("setPool", [pool.protocol, pool.id, pool.fee, pool.tickSpacing, true]);
  }
  if (config.enableExecution === true) {
    if (!(config.oracles?.length >= 2) || !config.pools?.length || !(config.v3Adapter || config.v4Adapter)) throw new Error("Complete oracle, adapter and pool configuration before unpausing");
    call("setPaused", [false]);
    const oracles = await Promise.all(config.oracles.map(async (oracle) => ({ token: oracle.token, feed: oracle.feed, maxAge: oracle.maxAge, feedCodeHash: keccak256(await client.getCode({ address: oracle.feed })) })));
    const adapters = await Promise.all([[3, config.v3Adapter], [4, config.v4Adapter]].filter(([, value]) => value).map(async ([protocol, address]) => ({ protocol, address, codeHash: keccak256(await client.getCode({ address })) })));
    fs.writeFileSync(".stockscope/deployment-bindings.pending.json", JSON.stringify({ chainId: config.chainId, executor: config.executor, executorCodeHash: keccak256(await client.getCode({ address: config.executor })), sequencer: config.sequencer, adapters, oracles, pools: config.pools.map(({ protocol, id, fee, tickSpacing }) => ({ protocol, id, fee, tickSpacing })) }, null, 2));
  }
}
fs.mkdirSync(".stockscope", { recursive: true });
fs.writeFileSync(".stockscope/deployment-requests.json", JSON.stringify(requests, null, 2));
console.log(`Prepared ${requests.length} unsigned requests in .stockscope/deployment-requests.json. No transaction was submitted. Verify the manifest after all requests confirm.`);
