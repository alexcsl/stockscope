import { encodeAbiParameters, parseAbiParameters, toFunctionSelector } from "viem";

const originalFetch = globalThis.fetch;
const tokens = {
  AAPL: { name: "Apple", contract: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9" },
  NVDA: { name: "NVIDIA", contract: `0x${"2".repeat(40)}` },
  TSLA: { name: "Tesla", contract: `0x${"3".repeat(40)}` },
};
const multiplierSelector = toFunctionSelector("uiMultiplier()");
const xstockMultiplierSelector = toFunctionSelector("getCurrentMultiplier()");
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.robinhood.com" && url.pathname.startsWith("/rhj/")) {
    const assets = Object.entries(tokens).map(([symbol, token], index) => ({ id: `0x${String(index + 1).repeat(64)}`, status: "ASSET_STATUS_ACTIVE", tokenSymbol: symbol, tokenName: `${token.name} Stock Token`, tokenDecimals: 18, currentMultiplier: "1", pendingMultiplier: null, deployments: [{ chainId: 4663, contractAddress: token.contract }] }));
    if (url.pathname === "/rhj/assets") return Response.json({ assets });
    if (url.pathname === "/rhj/corporate-actions") return Response.json({ corpActions: [] });
    const symbol = url.pathname.split("/").at(-1);
    if (url.pathname.startsWith("/rhj/prices/") && tokens[symbol]) return Response.json({ quotes: [{ tokenSymbol: symbol, bid: "200", ask: "201", currency: "USD", isTradingHalt: false, generatedAt: new Date().toISOString(), deployments: [{ chainId: 4663, contractAddress: tokens[symbol].contract }] }] });
  }
  if (url.hostname === "api.dexscreener.com") return Response.json([]);
  if (url.hostname === "api.geckoterminal.com") return Response.json({ data: [] });
  const robinhoodRpc = new URL(process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com");
  if (url.hostname === robinhoodRpc.hostname && url.pathname === robinhoodRpc.pathname) {
    const request = JSON.parse(String(options?.body || "{}"));
    const result = request.method === "eth_chainId" ? "0x1237" : request.method === "eth_blockNumber" ? "0x100" : request.method === "eth_getCode" ? "0x6000" : request.method === "eth_call" ? encodeAbiParameters(parseAbiParameters("uint256"), [request.params[0].data.startsWith("0x313ce567") ? 18n : request.params[0].data.startsWith(multiplierSelector) || request.params[0].data.startsWith(xstockMultiplierSelector) ? 10n ** 18n : 0n]) : null;
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  }
  return originalFetch(input, options);
};
