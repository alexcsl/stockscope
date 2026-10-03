import fs from "node:fs";
import { network } from "hardhat";
import { createPublicClient, custom, http, parseAbi } from "viem";

const url = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const rpc = createPublicClient({ transport: http(url, { timeout: 15000, retryCount: 0 }) });
const blockNumber = await rpc.getBlockNumber();
const connection = await network.create({ network: "local", override: { forking: { url, blockNumber: Number(blockNumber) } } });
try {
  await connection.provider.request({ method: "evm_mine" });
  const client = createPublicClient({ transport: custom(connection.provider) });
  const asset = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
  const code = await client.getCode({ address: asset });
  const multiplier = await client.readContract({ address: asset, abi: parseAbi(["function uiMultiplier() view returns (uint256)"]), functionName: "uiMultiplier" });
  if (!code || code === "0x" || multiplier <= 0n) throw new Error("Fork identity verification failed");
  const proof = { checkedAt: new Date().toISOString(), sourceChainId: await rpc.getChainId(), block: blockNumber.toString(), asset, multiplier: multiplier.toString(), kind: "Read-only mainnet state on a local fork after one synthetic Shanghai block; not Nitro execution parity", tradeExecuted: false };
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/fork-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally { await connection.close(); }
