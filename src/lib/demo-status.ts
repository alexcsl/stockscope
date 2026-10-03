import { createPublicClient, http, keccak256, parseAbi, type Transport } from "viem";
import { executorAbi } from "./execution-abi";
import { testnetExplorer, testnetRpc, validTestnetManifest, type TestnetManifest } from "./testnet-execution";

export type DemoStatus = { state: "unconfigured" | "unavailable"; message: string } | {
  state: "ready" | "stale" | "paused";
  message: string;
  chainId: 421614;
  controller: `0x${string}`;
  owner: `0x${string}`;
  executor: `0x${string}`;
  explorer: string;
  symbols: string[];
};
const controllerAbi = parseAbi(["function owner() view returns (address)", "function activated() view returns (bool)", "function executor() view returns (address)"]);
const feedAbi = parseAbi(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"]);

export async function readDemoStatus(manifest: TestnetManifest | null, transport?: Transport): Promise<DemoStatus> {
  if (!manifest?.demo) return { state: "unconfigured", message: "Demo execution is not configured." };
  try {
    if (!validTestnetManifest(manifest)) throw new Error("Invalid demo configuration");
    const client = createPublicClient({ transport: transport || http(testnetRpc(manifest.chainId), { timeout: 7000, retryCount: 0 }) });
    if (await client.getChainId() !== 421614) throw new Error("Wrong network");
    const bindings = [manifest.demo.controller, manifest.executor, manifest.stablecoin, manifest.sequencer, ...manifest.assets.flatMap((asset) => [asset.token, asset.adapter, asset.venue, asset.quoter, ...(asset.factory ? [asset.factory] : []), ...asset.oracles.map((oracle) => oracle.feed)])];
    await Promise.all(bindings.map(async (binding) => {
      const code = await client.getCode({ address: binding.address });
      if (!code || code === "0x" || keccak256(code) !== binding.codeHash) throw new Error("Contract binding mismatch");
    }));
    const [owner, activated, executor, paused, block] = await Promise.all([
      client.readContract({ address: manifest.demo.controller.address, abi: controllerAbi, functionName: "owner" }),
      client.readContract({ address: manifest.demo.controller.address, abi: controllerAbi, functionName: "activated" }),
      client.readContract({ address: manifest.demo.controller.address, abi: controllerAbi, functionName: "executor" }),
      client.readContract({ address: manifest.executor.address, abi: executorAbi, functionName: "paused" }), client.getBlock(),
    ]);
    if (!activated || executor.toLowerCase() !== manifest.executor.address.toLowerCase()) throw new Error("Demo inactive");
    const rounds = await Promise.all(manifest.assets.flatMap((asset) => asset.oracles.map(async (oracle) => ({ maxAge: oracle.maxAge, round: await client.readContract({ address: oracle.feed.address, abi: feedAbi, functionName: "latestRoundData" }) }))));
    const stale = rounds.some(({ maxAge, round }) => round[1] <= BigInt(0) || round[3] === BigInt(0) || round[3] > block.timestamp || block.timestamp - round[3] > BigInt(maxAge));
    const state = paused ? "paused" : stale ? "stale" : "ready";
    return { state, message: paused ? "Demo execution is paused." : stale ? "Demo price checks expired. The owner can refresh the fixed test feeds." : "Demo contracts are active. Each trade still needs a fresh safety check and wallet approval.", chainId: 421614, controller: manifest.demo.controller.address, owner, executor, explorer: testnetExplorer(421614), symbols: manifest.assets.map((asset) => asset.symbol) };
  } catch { return { state: "unavailable", message: "Demo contract status could not be verified. Trading stays unavailable until its safety checks pass." }; }
}
