import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/demo", destination: "/terminal?market=xstocks", permanent: true },
      { source: "/compare", destination: "/terminal?section=compare#compare", permanent: true },
      { source: "/assets/:slug", destination: "/xstocks/:slug", permanent: true },
    ];
  },
  outputFileTracingExcludes: { "/*": ["./.stockscope/**/*", "./.env*", "./artifacts/**/*"] },
  outputFileTracingIncludes: { "/api/*": ["./src/lib/supabase-prod-ca.crt"] },
};

export default nextConfig;
