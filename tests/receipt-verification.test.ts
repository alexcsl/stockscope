import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Address, type Hex } from "viem";
import { executorAbi } from "../src/lib/execution-abi";
import { reconcileLogs } from "../src/lib/receipt-verification";

const user = `0x${"1".repeat(40)}` as Address;
const executor = `0x${"2".repeat(40)}` as Address;
const input = `0x${"3".repeat(40)}` as Address;
const output = `0x${"4".repeat(40)}` as Address;
const hash = `0x${"5".repeat(64)}` as Hex;
function transfer(address: Address, from: Address, to: Address, value: bigint) {
  return { address, topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }) as Hex[], data: encodeAbiParameters([{ type: "uint256" }], [value]) };
}
const execution = { address: executor, topics: encodeEventTopics({ abi: executorAbi, eventName: "Executed", args: { user, evidenceHash: hash } }) as Hex[], data: encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [input, output, BigInt(5), BigInt(10), BigInt(0)]) };
test("confirmation requires matching executor event and both token transfers", () => {
  const paid = transfer(input, user, executor, BigInt(5));
  const received = transfer(output, executor, user, BigInt(10));
  assert.equal(reconcileLogs([paid, received, execution], executor, user, hash, input, output, "5"), "10");
  assert.equal(reconcileLogs([received, execution], executor, user, hash, input, output, "5"), null);
  assert.equal(reconcileLogs([paid, execution], executor, user, hash, input, output, "5"), null);
  assert.equal(reconcileLogs([paid, transfer(output, executor, user, BigInt(9)), execution], executor, user, hash, input, output, "5"), null);
  assert.equal(reconcileLogs([paid, received, execution], executor, user, hash, input, output, "6"), null);
});
