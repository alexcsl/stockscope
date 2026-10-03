import fs from "node:fs";
import { createPublicClient, encodeDeployData, encodeFunctionData, formatEther, http, isAddress, keccak256, pad, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileContracts } from "./compile-contracts.mjs";

const owner = process.argv[2];
const controller = process.argv[3];
if (!isAddress(owner) || /^0x0{40}$/i.test(owner)) throw new Error("Supply the public deployment owner address");
const chainId = 421614;
const router = "0x101F443B4d1b059569D643917553c771E1b9663E";
const factory = "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e";
const quoter = "0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B";
const client = createPublicClient({ transport: http(process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc", { timeout: 15000, retryCount: 0 }) });
if (await client.getChainId() !== chainId) throw new Error("Arbitrum Sepolia required");
for (const address of [router, factory, quoter]) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error("Uniswap dependency missing");
}
const signer = privateKeyToAccount((process.env.POLICY_SIGNER_PRIVATE_KEY || fs.readFileSync(".stockscope/policy-signer.key", "utf8")).trim());
const contracts = compileContracts();
const artifact = Object.values(contracts).map((entries) => entries.TestnetDemo).find(Boolean);
let data;
let label;
if (!controller) {
  data = encodeDeployData({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args: [owner, signer.address, router, factory] });
  if ((data.length - 2) / 2 > 49152) throw new Error("Deployment init code exceeds EVM limit");
  label = "Deploy StockScope demo contracts and Uniswap testnet pool";
} else {
  if (!isAddress(controller) || !await client.getCode({ address: controller })) throw new Error("Deployed demo controller required");
  const deployedOwner = await client.readContract({ address: controller, abi: artifact.abi, functionName: "owner" });
  if (deployedOwner.toLowerCase() !== owner.toLowerCase()) throw new Error("Demo owner mismatch");
  const activated = await client.readContract({ address: controller, abi: artifact.abi, functionName: "activated" });
  if (!activated) {
    data = encodeFunctionData({ abi: artifact.abi, functionName: "activate" });
    label = "Activate demo pool, configure executor, and allocate owner test tokens";
  } else {
    const read = (functionName) => client.readContract({ address: controller, abi: artifact.abi, functionName });
    const [executor, stablecoin, stock, sequencer, adapter, pool, stableFeed, stockFeed] = await Promise.all(["executor", "stablecoin", "stock", "sequencer", "adapter", "pool", "stableFeed", "stockFeed"].map(read));
    const binding = async (address, sourceUrl = `https://sepolia.arbiscan.io/address/${address}`) => {
      const code = await client.getCode({ address });
      if (!code || code === "0x") throw new Error("Manifest contract missing");
      return { address, codeHash: keccak256(code), sourceUrl };
    };
    const executorABI = parseAbi(["function owner() view returns (address)", "function paused() view returns (bool)", "function policySigner() view returns (address)"]);
    const [actualOwner, paused, actualSigner] = await Promise.all(["owner", "paused", "policySigner"].map((functionName) => client.readContract({ address: executor, abi: executorABI, functionName })));
    if (actualOwner.toLowerCase() !== owner.toLowerCase() || paused || actualSigner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("Executor owner, activation, or policy signer mismatch");
    const manifest = { chainId, demo: { controller: await binding(controller) }, executor: await binding(executor), stablecoin: await binding(stablecoin), sequencer: await binding(sequencer), assets: [{ symbol: "AAPL", assetKey: "robinhood:4663:0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", token: await binding(stock), protocol: 3, adapter: await binding(adapter), venue: await binding(router), factory: await binding(factory), quoter: await binding(quoter), poolId: pad(pool), fee: 3000, tickSpacing: 0, oracles: [{ token: stablecoin, feed: await binding(stableFeed), maxAge: 3600 }, { token: stock, feed: await binding(stockFeed), maxAge: 3600 }] }] };
    fs.writeFileSync(".stockscope/testnet-execution.json", JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ state: "activated", chainId, controller, executor, pool, policySigner: signer.address, manifest: "written", demoOnly: true }));
    process.exit(0);
  }
}
const gas = await client.estimateGas({ account: owner, to: controller, data, value: 0n });
const price = await client.getGasPrice();
const balance = await client.getBalance({ address: owner });
if (balance < gas * price * 2n) throw new Error("Deployment wallet needs more Arbitrum Sepolia test ETH");
fs.mkdirSync(".stockscope", { recursive: true });
fs.writeFileSync(".stockscope/deployment-requests.json", JSON.stringify([{ label, chainId: "0x66eee", from: owner, ...(controller ? { to: controller } : {}), data, value: "0x0" }], null, 2));
console.log(JSON.stringify({ unsigned: true, chainId, owner, policySigner: signer.address, gas: gas.toString(), estimatedFeeEth: formatEther(gas * price), balanceEth: formatEther(balance), label }));
