import type { EIP1193Provider } from "viem";

export type BrowserWallet = EIP1193Provider & { on?: (event: string, callback: () => void) => void; removeListener?: (event: string, callback: () => void) => void };
export interface WalletOption { id: string; name: string; provider: BrowserWallet }
export async function discoverWallets(): Promise<WalletOption[]> {
  const wallets = new Map<string, WalletOption>();
  const receive = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: { uuid?: string; name?: string }; provider?: BrowserWallet }>).detail;
    if (detail?.info?.uuid && detail.info.name && typeof detail.provider?.request === "function") wallets.set(detail.info.uuid, { id: detail.info.uuid, name: detail.info.name, provider: detail.provider });
  };
  window.addEventListener("eip6963:announceProvider", receive);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, 300));
  window.removeEventListener("eip6963:announceProvider", receive);
  const fallback = (window as Window & { ethereum?: BrowserWallet }).ethereum;
  if (!wallets.size && fallback) wallets.set("injected", { id: "injected", name: "Browser wallet", provider: fallback });
  return [...wallets.values()].sort((a, b) => Number(b.name === "MetaMask") - Number(a.name === "MetaMask"));
}
export async function requestAccounts(provider: EIP1193Provider): Promise<`0x${string}`[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([provider.request({ method: "eth_requestAccounts" }), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Wallet connection timed out. Open the selected wallet and resolve its pending request before retrying.")), 45000); })]);
  } finally { if (timeout) clearTimeout(timeout); }
}
