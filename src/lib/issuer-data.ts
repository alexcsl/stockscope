const apiBase = "https://api.xstocks.fi/api/v2/public/assets/NVDAx";

export const issuerSources = {
  asset: apiBase,
  price: `${apiBase}/price-data`,
  multiplier: `${apiBase}/multiplier?network=Arbitrum`,
};

export interface IssuerPilot {
  retrievedAt: string;
  identity: {
    name: string;
    symbol: "NVDAx";
    isin: string;
    underlyingSymbol: "NVDA";
    contractAddress: string;
    usdcAddress: string;
  } | null;
  priceUsd: number | null;
  multiplier: number | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

async function readSource(url: string, fetcher: typeof fetch): Promise<unknown> {
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function getIssuerPilot(
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<IssuerPilot> {
  const [assetRaw, priceRaw, multiplierRaw] = await Promise.all([
    readSource(issuerSources.asset, fetcher),
    readSource(issuerSources.price, fetcher),
    readSource(issuerSources.multiplier, fetcher),
  ]);

  const asset = record(assetRaw);
  const deployments = Array.isArray(asset?.deployments) ? asset.deployments : [];
  const arbitrum = deployments.map(record).find((item) => item?.network === "Arbitrum");
  const address = arbitrum?.address;
  const stablecoins = Array.isArray(arbitrum?.stablecoins) ? arbitrum.stablecoins : [];
  const usdc = stablecoins.map(record).find((item) => item?.symbol === "USDC" && item.currency === "USD" && item.network === "Arbitrum");
  const identity =
    asset?.symbol === "NVDAx" &&
    asset.underlyingSymbol === "NVDA" &&
    record(asset.trading)?.currency === "USD" &&
    typeof asset.name === "string" &&
    typeof asset.isin === "string" &&
    typeof address === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(address) &&
    typeof usdc?.address === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(usdc.address) &&
    usdc.decimals === 6
      ? {
          name: asset.name,
          symbol: "NVDAx" as const,
          isin: asset.isin,
          underlyingSymbol: "NVDA" as const,
          contractAddress: address,
          usdcAddress: usdc.address,
        }
      : null;

  return {
    retrievedAt: now().toISOString(),
    identity,
    priceUsd: identity ? positiveNumber(record(priceRaw)?.quote) : null,
    multiplier: identity ? positiveNumber(record(multiplierRaw)?.currentMultiplier) : null,
  };
}
