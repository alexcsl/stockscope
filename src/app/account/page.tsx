import { AccountPanel } from "@/components/account-panel";
import { SiteHeader } from "@/components/site-header";

export default function AccountPage() {
  return <><SiteHeader /><main className="page-shell"><div className="page-heading"><h1>Your research account</h1></div><AccountPanel /></main></>;
}
