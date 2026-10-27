import type { CatalogSnapshot, XStockListing } from "./xstocks-catalog";

export function parseCatalogSnapshot(value: unknown): CatalogSnapshot {
  if (!value || typeof value !== "object") throw new Error("invalid_catalog");
  const snapshot = value as Record<string, unknown>;
  if (!Array.isArray(snapshot.assets) || typeof snapshot.complete !== "boolean" ||
      typeof snapshot.retrievedAt !== "string" || !Number.isFinite(Date.parse(snapshot.retrievedAt)) ||
      (snapshot.reason !== null && typeof snapshot.reason !== "string")) throw new Error("invalid_catalog");
  const assets: XStockListing[] = snapshot.assets.map((value) => {
    if (!value || typeof value !== "object") throw new Error("invalid_catalog");
    const asset = value as Record<string, unknown>;
    if (typeof asset.symbol !== "string" || !/^[A-Za-z0-9]{1,15}x$/.test(asset.symbol) ||
        typeof asset.name !== "string" || !asset.name.trim() ||
        typeof asset.underlying !== "string" || !asset.underlying.trim() ||
        typeof asset.contract !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(asset.contract) ||
        (asset.isin !== null && typeof asset.isin !== "string")) throw new Error("invalid_catalog");
    return asset as unknown as XStockListing;
  });
  return { assets, complete: snapshot.complete, retrievedAt: snapshot.retrievedAt, reason: snapshot.reason } as CatalogSnapshot;
}
