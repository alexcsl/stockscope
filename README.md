# StockScope

StockScope is a research terminal for tokenized stocks. It brings together issuer identity, sourced market observations, comparison tools, cited research reports, and unsigned trade plans.

Public research works without an account. Email accounts save research privately across devices. Firebase provides email sign-up, verification, and password recovery. Supabase stores private research records. Earlier password accounts retain their separate research.

Install dependencies with npm ci, then start development with npm run dev. Use the example environment configuration for the optional providers. Keep credentials outside version control.

TokenRouter provides optional cited AI explanations and drafts under a shared monthly budget of one dollar. Model prices are verified automatically. Missing providers, incomplete history, and unsupported routes remain unavailable rather than displaying invented data.

Uniswap quotes are research estimates. Wallet actions require explicit user approval. Guarded execution is restricted to supported testnets and requires verified contract, pool, token, and feed configuration. Public stock settlement is not established.

Run npm run lint, npm run typecheck, npm run test:unit, npm run test:contracts, npm run docs:check, npm run build, and npm run test:browser for local validation. The optional hosted database and read-only fork checks require their respective configuration.

Scheduled monitoring stores notices in the app. Background email and push alerts are unavailable.
