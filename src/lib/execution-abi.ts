import { parseAbi } from "viem";

export const orderTypes = {
  TradeOrder: [
    { name: "user", type: "address" }, { name: "input", type: "address" }, { name: "output", type: "address" }, { name: "asset", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "minOut", type: "uint256" }, { name: "protocol", type: "uint8" }, { name: "poolId", type: "bytes32" },
    { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "multiplier", type: "uint256" }, { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }, { name: "policyVersion", type: "uint256" }, { name: "configEpoch", type: "uint256" }, { name: "evidenceHash", type: "bytes32" },
  ],
} as const;

export const orderTuple = "(address user,address input,address output,address asset,uint256 amountIn,uint256 minOut,uint8 protocol,bytes32 poolId,uint24 fee,int24 tickSpacing,uint256 multiplier,uint256 nonce,uint256 deadline,uint256 policyVersion,uint256 configEpoch,bytes32 evidenceHash)";
export const executorAbi = parseAbi([
  "error Rejected(string reason)",
  `function execute(${orderTuple} order, bytes signature) returns (uint256)`,
  "function nonces(address) view returns (uint256)", "function configEpoch() view returns (uint256)", "function paused() view returns (bool)",
  "function policySigner() view returns (address)", "function usdg() view returns (address)", "function sequencer() view returns (address)",
  "function adapters(uint8) view returns (address)", "function allowedPools(bytes32) view returns (bool)",
  "function oracles(address) view returns (address feed,uint32 maxAge,uint8 tokenDecimals,uint8 feedDecimals)",
  "function inputValue(address token,uint256 amount) view returns (uint256)",
  "event Executed(address indexed user,bytes32 indexed evidenceHash,address input,address output,uint256 amountIn,uint256 amountOut,uint256 nonce)",
]);

export interface TradePreparation {
  network?: { chainId: number; explorer: string; testnet: true; stockToken: `0x${string}`; stablecoin: `0x${string}` };
  decision: import("./policy").PolicyDecision;
  quote: import("./uniswap-route").UniswapRoute;
  approval: { token: `0x${string}`; spender: `0x${string}`; amount: string } | null;
  transaction: { to: `0x${string}`; data: `0x${string}`; value: "0x0"; gas: string; estimatedFeeWei: string } | null;
  message: string;
}
