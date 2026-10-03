import { getSourcedAsset } from "../src/lib/robinhood-data";
import { robinhoodVenue } from "../src/lib/venue-market";
import { buildReport, proposalMatches } from "../src/lib/agent-workflows";
import { draftTrade } from "../src/lib/agent-planner";
import { analystConfig } from "../src/lib/analyst";
import { writeFile, mkdir } from "node:fs/promises";

const asset = await getSourcedAsset("AAPL");
if (asset.identity.state !== "available" || asset.chain.state !== "available") throw new Error("Current exact AAPL identity is unavailable. No paid call was made.");
const assetKey = `robinhood:4663:${asset.identity.value.contract.toLowerCase()}`;
const venue = await robinhoodVenue(asset.identity.value.contract);
const report = buildReport(assetKey, asset, venue, "briefing");
const result = await draftTrade(report, "Buy AAPL with 5 USDG", analystConfig());
if (!("proposal" in result)) { console.log(JSON.stringify(result)); process.exitCode = 1; }
else {
  const proposal = result.proposal;
  const evidence = { checkedAt: new Date().toISOString(), state: result.state, proposal, exactInputVerified: proposalMatches(proposal, assetKey, "AAPL", "buy", "5000000"), alteredInputRejected: !proposalMatches(proposal, assetKey, "AAPL", "buy", "6000000"), publicSettlement: "unverified", report };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/agent-live-validation.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ state: result.state, model: proposal.model, costUsd: proposal.usage?.costUsd, exactInputVerified: evidence.exactInputVerified, alteredInputRejected: evidence.alteredInputRejected, publicSettlement: evidence.publicSettlement }));
}
