const descriptions: Record<string, [string, string]> = {
  testnet: ["Testnet only", "Wallet execution is restricted to verified test networks. Mainnet research stays separate."],
  identity: ["Correct token", "The issuer listing and blockchain token must match."],
  multiplier: ["Stable share conversion", "A pending conversion change or paused price feed needs review."],
  issuer_reference: ["Recent issuer price", "The issuer must report a recent price without a trading halt."],
  corporate_actions: ["Issuer events reviewed", "Unresolved share splits, dividends, or other issuer events need review."],
  quote: ["Fresh estimate for your amount", "The estimate must match this token, direction, and amount and remain unexpired."],
  supported_route: ["Supported trading pool", "The route must use a pool the guarded trade system supports."],
  amount_limit: ["Within the demo limit", "The current input value must be no more than $10."],
  deployment: ["Trade system verified", "The execution contracts and price sources must be configured and verified."],
  simulation: ["Transaction rehearsal", "The transaction must succeed in a check against the current blockchain state."],
};
export function policyLanguage(code: string) {
  return descriptions[code] || [code.replaceAll("_", " "), "Review the recorded source details for this check."];
}
