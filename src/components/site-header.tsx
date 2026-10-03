import { NavigationLink as Link } from "./navigation-link";
import { ArrowUpRight } from "lucide-react";

export function SiteHeader({ active = "terminal", market }: { active?: "home" | "terminal" | "robinhood" | "demo" | "compare" | "account"; market?: "robinhood" | "xstocks" }) {
  const terminalHref = market ? `/terminal?market=${market}` : "/terminal";
  return (
    <><header className="site-header">
      <div className="site-header-inner page-shell">
        <Link className="brand" href="/" aria-label="StockScope home">
          <span>StockScope</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          <Link className={`nav-link${active === "home" ? " nav-link-active" : ""}`} href="/" aria-current={active === "home" ? "page" : undefined}>Overview</Link>
          <Link className={`nav-link${active === "terminal" ? " nav-link-active" : ""}`} href={terminalHref} aria-current={active === "terminal" ? "page" : undefined}>
            Terminal
          </Link>
          <Link className={`nav-link${active === "robinhood" ? " nav-link-active" : ""}`} href="/robinhood" aria-current={active === "robinhood" ? "page" : undefined}>
            Swap
          </Link>
          <Link className={`nav-link${active === "account" ? " nav-link-active" : ""}`} href="/account" aria-current={active === "account" ? "page" : undefined}>Account</Link>
        </nav>
        <Link className="header-link" href={terminalHref}>
          Open terminal <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </header>{process.env.VERCEL === "1" ? <p className="page-shell cell-meta">Public research beta. Sign in for saved research and configured providers. Source availability varies. Live trading remains gated.</p> : null}</>
  );
}
