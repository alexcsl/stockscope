import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { network } from "hardhat";
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, encodeAbiParameters, keccak256, pad, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileContracts } from "../../contracts/compile-contracts.mjs";
import { buildReport, proposalMatches } from "../../src/lib/agent-workflows";
import { draftTrade } from "../../src/lib/agent-planner";
import { prepareTestnetTrade, type TestnetManifest } from "../../src/lib/testnet-execution";
import { reconcileLogs } from "../../src/lib/receipt-verification";
import { sourcedAsset, contract } from "../source-fixtures";
import type { PolicyEvidence } from "../../src/lib/policy";

test("agent draft to guarded V3/V4 transaction and reconciled receipt on a local testnet simulation", async (suite) => {
  const connection = await network.create("arbitrumDemo");
  try {
    const transport = custom(connection.provider);
    const client = createPublicClient({ transport });
    const wallet = createWalletClient({ transport });
    const [owner] = await wallet.getAddresses();
    const signerKey = `0x${"42".repeat(32)}` as Hex;
    const signer = privateKeyToAccount(signerKey);
    const contracts = compileContracts(true) as Record<string, Record<string, { abi: Abi; evm: { bytecode: { object: string } } }>>;
    const artifact = (name: string) => Object.values(contracts).map((entry) => entry[name]).find(Boolean)!;
    const deploy = async (name: string, args: unknown[] = []) => {
      const entry = artifact(name);
      const hash = await wallet.deployContract({ account: owner, chain: null, abi: entry.abi, bytecode: `0x${entry.evm.bytecode.object}`, args });
      return (await client.waitForTransactionReceipt({ hash })).contractAddress!;
    };
    const write = async (name: string, address: Address, functionName: string, args: unknown[]) => {
      const hash = await wallet.writeContract({ account: owner, chain: null, address, abi: artifact(name).abi, functionName, args });
      assert.equal((await client.waitForTransactionReceipt({ hash })).status, "success");
    };
    const stablecoin = await deploy("MockToken", ["USDG", 6]);
    const stock = await deploy("MockToken", ["AAPL", 18]);
    const sequencer = await deploy("MockFeed", [0]);
    const stableFeed = await deploy("MockFeed", [100000000]);
    const stockFeed = await deploy("MockFeed", [20000000000]);
    const executor = await deploy("GuardedExecutor", [owner, signer.address, stablecoin, sequencer]);
    const pool = await deploy("MockPool");
    const factory = await deploy("MockFactory", [pool]);
    const router = await deploy("MockRouter", [factory]);
    const manager = await deploy("MockManager");
    const v3 = await deploy("V3Adapter", [executor, router, factory]);
    const v4 = await deploy("V4Adapter", [executor, manager]);
    const [currency0, currency1] = [stablecoin, stock].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const v4Id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [currency0, currency1, 3000, 10, "0x0000000000000000000000000000000000000000"]));
    await write("GuardedExecutor", executor, "setOracle", [stablecoin, stableFeed, 300]);
    await write("GuardedExecutor", executor, "setOracle", [stock, stockFeed, 300]);
    await write("GuardedExecutor", executor, "setAdapter", [3, v3]);
    await write("GuardedExecutor", executor, "setAdapter", [4, v4]);
    await write("GuardedExecutor", executor, "setPool", [3, pad(pool), 3000, 0, true]);
    await write("GuardedExecutor", executor, "setPool", [4, v4Id, 3000, 10, true]);
    await write("GuardedExecutor", executor, "setPaused", [false]);
    await write("MockToken", stablecoin, "mint", [owner, 100000000]);
    const binding = async (address: Address) => ({ address, codeHash: keccak256((await client.getCode({ address }))!), sourceUrl: "https://example.com/local-test-fixture" });
    const assetKey = `robinhood:4663:${contract.toLowerCase()}`;
    const report = buildReport(assetKey, sourcedAsset, { state: "unavailable", checkedAt: new Date().toISOString(), reason: "Local fixture", pairs: [] }, "briefing");
    const draft = await draftTrade(report, "Buy AAPL with 5 USDG", { apiKey: "fixture", verifiedAt: new Date().toISOString(), inputPerMillion: "0.1", outputPerMillion: "0.5", directory: await mkdtemp(join(tmpdir(), "stockscope-agent-contract-")) }, (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ assetKey, symbol: "AAPL", direction: "buy", amount: "5", rationale: "Exact identity is cited [1]. Testnet settlement requires fresh checks." }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } })) as typeof fetch);
    assert.ok("proposal" in draft);
    if (!("proposal" in draft)) return;
    assert.equal(proposalMatches(draft.proposal, assetKey, "AAPL", "buy", "5000000"), true);
    for (const protocol of [3, 4] as const) await suite.test(`protocol ${protocol}: approval, guarded buy/sell, receipt and replay rejection`, async () => {
      const manifest: TestnetManifest = { chainId: 421614, executor: await binding(executor), stablecoin: await binding(stablecoin), sequencer: await binding(sequencer), assets: [{ symbol: "AAPL", assetKey, token: await binding(stock), protocol, adapter: await binding(protocol === 3 ? v3 : v4), venue: await binding(protocol === 3 ? router : manager), ...(protocol === 3 ? { factory: await binding(factory) } : {}), quoter: await binding(protocol === 3 ? router : manager), poolId: protocol === 3 ? pad(pool) : v4Id, fee: 3000, tickSpacing: protocol === 3 ? 0 : 10, oracles: [{ token: stablecoin, feed: await binding(stableFeed), maxAge: 300 }, { token: stock, feed: await binding(stockFeed), maxAge: 300 }] }] };
      let saved: PolicyEvidence | null = null;
      let failure = "";
      let chainTime = Number((await client.getBlock()).timestamp) * 1000;
      const options = { transport, signerKey, now: () => new Date(chainTime), persist: async (evidence: PolicyEvidence) => { saved = structuredClone(evidence); }, onFailure: (error: unknown) => { const cause = error instanceof BaseError ? error.walk((item) => item instanceof ContractFunctionRevertedError) : null; failure = cause instanceof ContractFunctionRevertedError ? JSON.stringify(cause.data?.args) : String(error); } };
      const first = await prepareTestnetTrade(manifest, sourcedAsset, "buy", "5000000", owner, options);
      assert.equal(first.transaction, null);
      assert.ok(first.approval);
      await write("MockToken", stablecoin, "approve", [executor, 5000000]);
      for (const direction of ["buy", "sell"] as const) {
        const amount = direction === "buy" ? "5000000" : "25000000000000000";
        if (direction === "sell") await write("MockToken", stock, "approve", [executor, BigInt(amount)]);
        chainTime = Number((await client.getBlock()).timestamp) * 1000;
        const prepared = await prepareTestnetTrade(manifest, sourcedAsset, direction, amount, owner, options);
        assert.equal(prepared.decision.status, "eligible", `${prepared.message} ${failure}`);
        assert.ok(prepared.transaction);
        assert.equal(prepared.decision.evidenceHash, (await import("../../src/lib/policy")).hashEvidence(saved));
        const transaction = prepared.transaction!;
        const hash = await wallet.sendTransaction({ account: owner, chain: null, to: transaction.to, data: transaction.data, gas: BigInt(transaction.gas) });
        const receipt = await client.waitForTransactionReceipt({ hash });
        assert.equal(receipt.status, "success");
        assert.equal(reconcileLogs(receipt.logs, executor, owner, prepared.decision.evidenceHash, direction === "buy" ? stablecoin : stock, direction === "buy" ? stock : stablecoin, amount), prepared.quote.outputAmount);
        await assert.rejects(client.call({ account: owner, to: transaction.to, data: transaction.data }));
      }
      const mismatched = structuredClone(manifest);
      mismatched.executor.codeHash = `0x${"11".repeat(32)}`;
      const rejected = await prepareTestnetTrade(mismatched, sourcedAsset, "buy", "5000000", owner, options);
      assert.equal(rejected.approval, null);
      assert.equal(rejected.transaction, null);
      assert.equal(rejected.decision.status, "blocked");
    });
  } finally { await connection.close(); }
});
