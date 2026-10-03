import { decodeEventLog, erc20Abi, type Address, type Hex } from "viem";
import { executorAbi } from "./execution-abi";

export function reconcileLogs(logs: { address: Address; data: Hex; topics: readonly Hex[] }[], executor: Address, user: Address, evidenceHash: string, input: Address, output: Address, amount: string): string | null {
  let received: bigint | null = null;
  let paid = false;
  for (const log of logs) {
    try {
      if (log.address.toLowerCase() === executor.toLowerCase()) {
        const event = decodeEventLog({ abi: executorAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
        if (event.eventName === "Executed" && event.args.user.toLowerCase() === user.toLowerCase() && event.args.evidenceHash === evidenceHash && event.args.input.toLowerCase() === input.toLowerCase() && event.args.output.toLowerCase() === output.toLowerCase() && event.args.amountIn.toString() === amount && event.args.amountOut > BigInt(0)) received = event.args.amountOut;
      }
      if (log.address.toLowerCase() === input.toLowerCase()) {
        const transfer = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
        if (transfer.eventName === "Transfer" && transfer.args.from.toLowerCase() === user.toLowerCase() && transfer.args.to.toLowerCase() === executor.toLowerCase() && transfer.args.value.toString() === amount) paid = true;
      }
    } catch { continue; }
  }
  if (!paid || received === null) return null;
  for (const log of logs.filter((log) => log.address.toLowerCase() === output.toLowerCase())) {
    try {
      const transfer = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (transfer.eventName === "Transfer" && transfer.args.from.toLowerCase() === executor.toLowerCase() && transfer.args.to.toLowerCase() === user.toLowerCase() && transfer.args.value === received) return received.toString();
    } catch { continue; }
  }
  return null;
}
