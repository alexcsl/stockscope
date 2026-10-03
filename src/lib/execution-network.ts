export const testnetChainIds = [421614, 46630] as const;
export function executionChainAllowed(chainId: number): boolean { return (testnetChainIds as readonly number[]).includes(chainId); }
