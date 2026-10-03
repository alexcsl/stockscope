import { getSourcedAsset, robinhoodSymbols } from "./robinhood-data";
import { sourceValue } from "./observations";
import { robinhoodVenue } from "./venue-market";
import { getXStock } from "./xstocks-catalog";
import type { VenuePair } from "./venue-market";
export type ComparisonSelection = { issuer: "robinhood" | "xstocks"; symbol: string };
export type ComparisonRecord = ComparisonSelection & { name: string; contract: string | null; state: string; multiplier: string | null; pair: VenuePair | null; reason: string };
export function parseSelection(raw: string): ComparisonSelection[] {
  return raw.split(",").slice(0, 4).flatMap((item): ComparisonSelection[] => {
    const [issuer, symbol] = item.split(":");
    if (issuer === "robinhood" && robinhoodSymbols.includes(symbol as typeof robinhoodSymbols[number])) return [{ issuer, symbol }];
    if (issuer === "xstocks" && /^[A-Za-z0-9]{1,15}x$/.test(symbol)) return [{ issuer, symbol }];
    return [];
  }).filter((item, index, all) => all.findIndex((other) => other.issuer === item.issuer && other.symbol === item.symbol) === index);
}
export async function comparisonRecord(item: ComparisonSelection): Promise<ComparisonRecord> {
  if (item.issuer === "xstocks") {
    const asset = await getXStock(item.symbol);
    return { ...item, name: asset?.name || item.symbol, contract: asset?.contract || null, state: asset?.state || "unavailable", multiplier: asset?.state === "verified" ? asset.multiplier : null, pair: asset?.venue?.state === "available" ? asset.venue.pairs[0] || null : null, reason: asset?.reason || "No verified venue is available." };
  }
  const asset = await getSourcedAsset(item.symbol);
  const identity = sourceValue(asset.identity);
  const venue = identity && asset.chain.state === "available" ? await robinhoodVenue(identity.contract) : null;
  return { ...item, name: identity?.name || item.symbol, contract: identity?.contract || null, state: asset.chain.state === "available" ? "verified" : "unavailable", multiplier: asset.chain.state === "available" ? identity?.multiplier || null : null, pair: venue?.state === "available" ? venue.pairs[0] || null : null, reason: asset.chain.reason || "No verified venue is available." };
}
