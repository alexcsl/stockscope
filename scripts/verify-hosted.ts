import { database } from "../src/lib/hosted-store";

try {
  const url = new URL(process.env.STOCKSCOPE_DATABASE_URL || "");
  console.log(JSON.stringify({ postgresProtocol: url.protocol === "postgresql:" || url.protocol === "postgres:", pooler: url.hostname.endsWith(".pooler.supabase.com"), port: url.port, placeholder: /\[|\]|YOUR_|PASSWORD/.test(url.password) }));
  const rows = await database()`select count(*)::integer as count from stockscope.state`;
  console.log(JSON.stringify({ database: "connected", records: rows[0].count }));
} catch (error) {
  console.log(JSON.stringify({ database: "unavailable", code: (error as { code?: string }).code || "invalid_configuration" }));
  process.exitCode = 1;
} finally { await database().end({ timeout: 1 }); }
