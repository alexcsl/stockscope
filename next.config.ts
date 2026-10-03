import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: { "/*": ["./.stockscope/**/*", "./.env*", "./artifacts/**/*"] },
  outputFileTracingIncludes: { "/api/*": ["./src/lib/supabase-prod-ca.crt"] },
};

export default nextConfig;
