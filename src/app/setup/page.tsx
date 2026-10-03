import { SiteHeader } from "@/components/site-header";
import { DeploymentWorkspace } from "@/components/deployment-workspace";

export default function SetupPage() {
  return <><SiteHeader /><main className="page-shell sourced-main"><div className="desk-heading"><div><span className="section-kicker">LOCAL OPERATOR WORKSPACE</span><h1>Testnet execution setup</h1><p>Deployment requests are prepared locally from verified testnet configuration. The wallet controls every signature. Mainnet requests are disabled.</p></div></div><div className="data-notice"><strong>Execution starts paused</strong><span>Configure verified adapters, pools, oracles and the policy signer before enabling trades. Do not expose these operator controls on a public deployment.</span></div><DeploymentWorkspace /></main></>;
}
