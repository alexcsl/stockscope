import { test } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { createPublicClient, createWalletClient, custom, encodeAbiParameters, encodeFunctionData, hashTypedData, keccak256, pad, type Address, type Hex, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileContracts } from "../../scripts/compile-contracts.mjs";
import { orderTypes } from "../../src/lib/execution-abi";

const contracts = compileContracts(true) as Record<string, Record<string, { abi: Abi; evm: { bytecode: { object: string } } }>>;
const signer = privateKeyToAccount(`0x${"42".repeat(32)}`);

test("guarded V3/V4 executor acceptance and adversarial scenarios", async (suite) => {
  const connection = await network.create("local");
  const transport = custom(connection.provider);
  const client = createPublicClient({ transport });
  const wallets = createWalletClient({ transport });
  const users = await wallets.getAddresses();
  const owner = users[0];
  const other = users[1];
  const artifact = (name: string) => Object.values(contracts).map((entries) => entries[name]).find(Boolean)!;
  async function deploy(name: string, args: unknown[] = []) {
    const contract = artifact(name);
    const hash = await wallets.deployContract({ account: owner, chain: null, abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, args });
    return (await client.waitForTransactionReceipt({ hash })).contractAddress!;
  }
  async function write(name: string, target: Address, fn: string, args: unknown[] = [], account = owner) {
    const hash = await wallets.writeContract({ account, chain: null, address: target, abi: artifact(name).abi, functionName: fn, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
  }
  const read = (name: string, address: Address, functionName: string, args: unknown[] = []) => client.readContract({ address, abi: artifact(name).abi, functionName, args });
  const usdg = await deploy("MockToken", ["USDG", 6]);
  const stock = await deploy("MockToken", ["STOCK", 18]);
  const stableFeed = await deploy("MockFeed", [100000000]);
  const stockFeed = await deploy("MockFeed", [20000000000]);
  const sequencer = await deploy("MockFeed", [0]);
  const executor = await deploy("GuardedExecutor", [owner, signer.address, usdg, sequencer]);
  const pool = await deploy("MockPool");
  const factory = await deploy("MockFactory", [pool]);
  const router = await deploy("MockRouter", [factory]);
  const manager = await deploy("MockManager");
  const v3 = await deploy("V3Adapter", [executor, router, factory]);
  const v4 = await deploy("V4Adapter", [executor, manager]);
  const tokens = [usdg, stock].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const v4Id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [tokens[0], tokens[1], 3000, 10, `0x${"0".repeat(40)}`]));
  await write("GuardedExecutor", executor, "setOracle", [usdg, stableFeed, 300]);
  await write("GuardedExecutor", executor, "setOracle", [stock, stockFeed, 300]);
  await write("GuardedExecutor", executor, "setAdapter", [3, v3]);
  await write("GuardedExecutor", executor, "setAdapter", [4, v4]);
  await write("GuardedExecutor", executor, "setPool", [3, pad(pool), 3000, 0, true]);
  await write("GuardedExecutor", executor, "setPool", [4, v4Id, 3000, 10, true]);
  await write("MockToken", usdg, "mint", [owner, 1000000000]);
  await write("MockToken", stock, "mint", [owner, BigInt("1000000000000000000")]);
  await write("MockToken", usdg, "approve", [executor, 1000000000]);
  await write("MockToken", stock, "approve", [executor, BigInt("1000000000000000000")]);
  await write("GuardedExecutor", executor, "setPaused", [false]);
  const domain = { name: "StockScope", version: "1", chainId: 31337, verifyingContract: executor };
  async function order(protocol: 3 | 4 = 3, sell = false) {
    const block = await client.getBlock();
    return { user: owner, input: sell ? stock : usdg, output: sell ? usdg : stock, asset: stock, amountIn: sell ? BigInt("25000000000000000") : BigInt(5000000), minOut: sell ? BigInt(4900000) : BigInt("24000000000000000"), protocol, poolId: protocol === 3 ? pad(pool) : v4Id, fee: 3000, tickSpacing: protocol === 3 ? 0 : 10, multiplier: BigInt("1000000000000000000"), nonce: await read("GuardedExecutor", executor, "nonces", [owner]) as bigint, deadline: block.timestamp + BigInt(25), policyVersion: BigInt(1), configEpoch: await read("GuardedExecutor", executor, "configEpoch") as bigint, evidenceHash: `0x${"11".repeat(32)}` as Hex };
  }
  const sign = (message: Awaited<ReturnType<typeof order>>) => signer.signTypedData({ domain, types: orderTypes, primaryType: "TradeOrder", message });
  const execute = async (message: Awaited<ReturnType<typeof order>>, signature?: Hex) => write("GuardedExecutor", executor, "execute", [message, signature || await sign(message)]);
  const reject = async (message: Awaited<ReturnType<typeof order>>, signature?: Hex, account = owner) => assert.rejects(client.simulateContract({ account, address: executor, abi: artifact("GuardedExecutor").abi, functionName: "execute", args: [message, signature || await sign(message)] }));
  await suite.test("typed digest matches viem and V3 buy settles balances without residual allowance", async () => {
    const message = await order();
    assert.equal(await read("GuardedExecutor", executor, "digest", [message]), hashTypedData({ domain, types: orderTypes, primaryType: "TradeOrder", message }));
    const before = await read("MockToken", stock, "balanceOf", [owner]) as bigint;
    await execute(message);
    assert.equal((await read("MockToken", stock, "balanceOf", [owner]) as bigint) - before, BigInt("25000000000000000"));
    assert.equal(await read("MockToken", usdg, "allowance", [executor, v3]), BigInt(0));
    assert.equal(await read("MockToken", usdg, "balanceOf", [executor]), BigInt(0));
    await reject(message);
  });
  await suite.test("V3 sell and V4 buy/sell execute through typed adapters", async () => { await execute(await order(3, true)); await execute(await order(4)); await execute(await order(4, true)); });
  await suite.test("expired, excessive, altered pool, recipient and signature reject", async () => {
    const base = await order();
    const signature = await sign(base);
    await reject({ ...base, deadline: BigInt(1) });
    await reject({ ...base, amountIn: BigInt(10000001) });
    await reject({ ...base, poolId: `0x${"33".repeat(32)}` });
    await reject({ ...base, user: other }, signature);
    await reject({ ...base, minOut: base.minOut + BigInt(1) }, signature);
    await reject(base, signature, other);
  });
  await suite.test("changed multiplier, paused oracle and stale feed reject", async () => {
    const base = await order();
    await write("MockToken", stock, "setMultiplier", [BigInt(2e18)]); await reject(base);
    await write("MockToken", stock, "setMultiplier", [BigInt(1e18)]);
    await write("MockToken", stock, "setOraclePaused", [true]); await reject(base);
    await write("MockToken", stock, "setOraclePaused", [false]);
    await write("MockFeed", stableFeed, "set", [100000000, 1]); await reject(base);
    await write("MockFeed", stableFeed, "set", [100000000, (await client.getBlock()).timestamp]);
    await write("MockFeed", sequencer, "set", [1, (await client.getBlock()).timestamp]); await reject(await order());
    await write("MockFeed", sequencer, "set", [0, (await client.getBlock()).timestamp]);
  });
  await suite.test("insufficient output, partial V4 input and unauthorized callback reject", async () => {
    await write("MockRouter", router, "setInsufficient", [true]); await reject(await order()); await write("MockRouter", router, "setInsufficient", [false]);
    await write("MockManager", manager, "setPartial", [true]); await reject(await order(4)); await write("MockManager", manager, "setPartial", [false]);
    await write("MockRouter", router, "setPartial", [true]); await reject(await order()); await write("MockRouter", router, "setPartial", [false]);
    await assert.rejects(client.simulateContract({ account: owner, address: v4, abi: artifact("V4Adapter").abi, functionName: "unlockCallback", args: ["0x"] }));
  });
  await suite.test("reentrancy is rejected and pause invalidates pending policy context", async () => {
    const message = await order();
    const data = encodeFunctionData({ abi: artifact("GuardedExecutor").abi, functionName: "execute", args: [message, await sign(message)] });
    await write("MockRouter", router, "setReentry", [executor, data]); await execute(message);
    assert.equal(await read("MockRouter", router, "reentryRejected"), true);
    const pending = await order(); await write("GuardedExecutor", executor, "setPaused", [true]); await reject(pending);
  });
  await connection.close();
});
