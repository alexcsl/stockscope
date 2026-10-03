export type ReadinessStatus = "ready" | "review" | "blocked";
export type CheckStatus = "pass" | "review" | "fail";

export interface SourceStamp {
  label: string;
  observedAt: string;
  mode: "demo";
}

export interface MarketQuote {
  venue: string;
  pair: string;
  tokenPriceUsd: number;
  referencePriceUsd: number;
  deviationPercent: number;
  volume24hUsd: number;
  depthUsd: number;
  tradeSizeUsd: number;
  estimatedImpactPercent: number;
  source: SourceStamp;
}

export interface CorporateAction {
  id: string;
  title: string;
  status: string;
  detail: string;
  source: SourceStamp;
}

export interface ProtocolIntegration {
  name: string;
  category: string;
  status: "illustrative" | "unverified";
  detail: string;
}

export interface EvidenceCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  source: SourceStamp;
}

export interface ActionReadiness {
  action: string;
  context: string;
  status: ReadinessStatus;
  checks: EvidenceCheck[];
}

export interface Asset {
  slug: string;
  symbol: string;
  name: string;
  underlyingSymbol: string;
  assetClass: "Equity" | "ETF";
  issuer: string;
  chain: string;
  contractAddress: string | null;
  accent: string;
  sparkline: number[];
  quote: MarketQuote;
  corporateActions: CorporateAction[];
  integrations: ProtocolIntegration[];
  readiness: ActionReadiness[];
}

export interface MarketDataProvider {
  listAssets(): Promise<Asset[]>;
  getAsset(slug: string): Promise<Asset | undefined>;
}

const snapshot = "2026-09-25T09:00:00Z";
const demoSource: SourceStamp = {
  label: "Local demo fixture",
  observedAt: snapshot,
  mode: "demo",
};

function checks(
  status: ReadinessStatus,
  action: "spot" | "collateral",
  impactPercent: number,
): EvidenceCheck[] {
  return [
    {
      name: "Reference price",
      status: "pass",
      detail: "Sample reference value available for this scenario.",
      source: demoSource,
    },
    {
      name: action === "spot" ? "Price impact" : "Wrapper conversion",
      status: status === "blocked" ? "fail" : "pass",
      detail:
        action === "spot"
          ? `${impactPercent.toFixed(2)}% sample impact ${status === "blocked" ? "exceeds" : "passes"} the illustrative 1.00% limit.`
          : status === "blocked"
            ? "Mock collateral adapter uses a stale conversion value."
            : "Sample wrapper conversion passes the illustrative check.",
      source: demoSource,
    },
    {
      name: "Integration evidence",
      status: action === "spot" && status === "ready" ? "pass" : "review",
      detail:
        action === "spot" && status === "ready"
          ? "Illustrative venue check passes."
          : "No live protocol check is connected.",
      source: demoSource,
    },
  ];
}

function asset(input: {
  slug: string;
  symbol: string;
  name: string;
  underlyingSymbol: string;
  assetClass: Asset["assetClass"];
  accent: string;
  tokenPriceUsd: number;
  referencePriceUsd: number;
  volume24hUsd: number;
  depthUsd: number;
  estimatedImpactPercent: number;
  tradeStatus: ReadinessStatus;
  collateralStatus: ReadinessStatus;
  sparkline: number[];
}): Asset {
  const deviationPercent =
    ((input.tokenPriceUsd - input.referencePriceUsd) /
      input.referencePriceUsd) *
    100;

  return {
    slug: input.slug,
    symbol: input.symbol,
    name: input.name,
    underlyingSymbol: input.underlyingSymbol,
    assetClass: input.assetClass,
    issuer: "xStocks product example",
    chain: "Arbitrum (illustrative)",
    contractAddress: null,
    accent: input.accent,
    sparkline: input.sparkline,
    quote: {
      venue: "Sample DEX venue",
      pair: `${input.symbol}/USDC`,
      tokenPriceUsd: input.tokenPriceUsd,
      referencePriceUsd: input.referencePriceUsd,
      deviationPercent,
      volume24hUsd: input.volume24hUsd,
      depthUsd: input.depthUsd,
      tradeSizeUsd: 10000,
      estimatedImpactPercent: input.estimatedImpactPercent,
      source: demoSource,
    },
    corporateActions: [
      {
        id: `${input.slug}-scenario`,
        title: "Corporate-action scenario",
        status: "Demo only",
        detail:
          "This fixture illustrates where an issuer event and multiplier reconciliation would appear. No live event feed is connected.",
        source: demoSource,
      },
    ],
    integrations: [
      {
        name: "Sample spot venue",
        category: "Trading",
        status: "illustrative",
        detail: "Illustrative quote and depth; no executable route is connected.",
      },
      {
        name: "Collateral adapter",
        category: "DeFi",
        status: "unverified",
        detail: "No live wrapper, oracle, or protocol integration is connected.",
      },
    ],
    readiness: [
      {
        action: "Spot trade",
        context: "$10,000 at sample venue",
        status: input.tradeStatus,
        checks: checks(input.tradeStatus, "spot", input.estimatedImpactPercent),
      },
      {
        action: "Supply collateral",
        context: "Illustrative protocol action",
        status: input.collateralStatus,
        checks: checks(input.collateralStatus, "collateral", input.estimatedImpactPercent),
      },
    ],
  };
}

const assets: Asset[] = [
  asset({
    slug: "aaplx",
    symbol: "AAPLx",
    name: "Apple xStock",
    underlyingSymbol: "AAPL",
    assetClass: "Equity",
    accent: "#b9d4f4",
    tokenPriceUsd: 227.84,
    referencePriceUsd: 227.51,
    volume24hUsd: 832000,
    depthUsd: 1840000,
    estimatedImpactPercent: 0.12,
    tradeStatus: "ready",
    collateralStatus: "review",
    sparkline: [28, 32, 30, 35, 34, 39, 37, 44, 42, 47, 49, 52],
  }),
  asset({
    slug: "nvdax",
    symbol: "NVDAx",
    name: "NVIDIA xStock",
    underlyingSymbol: "NVDA",
    assetClass: "Equity",
    accent: "#b8e970",
    tokenPriceUsd: 185.62,
    referencePriceUsd: 185.18,
    volume24hUsd: 1940000,
    depthUsd: 3210000,
    estimatedImpactPercent: 0.08,
    tradeStatus: "ready",
    collateralStatus: "review",
    sparkline: [28, 34, 31, 39, 38, 45, 42, 51, 49, 56, 54, 61],
  }),
  asset({
    slug: "tslax",
    symbol: "TSLAx",
    name: "Tesla xStock",
    underlyingSymbol: "TSLA",
    assetClass: "Equity",
    accent: "#f5a9a3",
    tokenPriceUsd: 261.14,
    referencePriceUsd: 263.03,
    volume24hUsd: 611000,
    depthUsd: 438000,
    estimatedImpactPercent: 1.42,
    tradeStatus: "blocked",
    collateralStatus: "blocked",
    sparkline: [58, 54, 57, 50, 48, 52, 45, 42, 44, 38, 40, 35],
  }),
  asset({
    slug: "spyx",
    symbol: "SPYx",
    name: "S&P 500 xStock",
    underlyingSymbol: "SPY",
    assetClass: "ETF",
    accent: "#c7b9ff",
    tokenPriceUsd: 568.33,
    referencePriceUsd: 568.11,
    volume24hUsd: 1130000,
    depthUsd: 2690000,
    estimatedImpactPercent: 0.06,
    tradeStatus: "ready",
    collateralStatus: "review",
    sparkline: [30, 32, 34, 33, 37, 39, 38, 42, 44, 43, 47, 50],
  }),
  asset({
    slug: "msftx",
    symbol: "MSFTx",
    name: "Microsoft xStock",
    underlyingSymbol: "MSFT",
    assetClass: "Equity",
    accent: "#efcc85",
    tokenPriceUsd: 427.72,
    referencePriceUsd: 427.43,
    volume24hUsd: 485000,
    depthUsd: 923000,
    estimatedImpactPercent: 0.29,
    tradeStatus: "review",
    collateralStatus: "review",
    sparkline: [31, 33, 31, 36, 35, 38, 37, 39, 42, 40, 43, 46],
  }),
];

export const demoMarketDataProvider: MarketDataProvider = {
  async listAssets() {
    return assets;
  },
  async getAsset(slug) {
    return assets.find((item) => item.slug === slug);
  },
};

export function formatUsd(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

export function formatCompactUsd(value: number) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2).replace(/\.?0+$/, "")}K`;
  }
  return formatUsd(value);
}

export function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
