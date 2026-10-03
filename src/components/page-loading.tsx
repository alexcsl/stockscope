export function PageLoading({ title = "Opening your research desk" }: { title?: string }) {
  return <section className="page-loading" role="status" aria-live="polite"><span className="section-kicker">STOCKSCOPE</span><h1>{title}</h1><p>Source panels load independently. You can keep navigating.</p><div className="loading-grid" aria-hidden="true"><div /><div /><div /></div></section>;
}
