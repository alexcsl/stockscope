import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accountId } from "./account-context";

let connection: ReturnType<typeof postgres> | undefined;
export function hostedConfigured(): boolean { return !!process.env.STOCKSCOPE_DATABASE_URL; }
export function database() {
  if (!connection) {
    const url = process.env.STOCKSCOPE_DATABASE_URL;
    if (!url) throw new Error("storage_not_configured");
    if (!/^postgres(?:ql)?:\/\//.test(url)) throw new Error("invalid_database_url");
    const ca = readFileSync(join(process.cwd(), "src/lib/supabase-prod-ca.crt"), "utf8");
    connection = postgres(url, { ssl: { rejectUnauthorized: true, ca }, prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });
  }
  return connection;
}

export async function hostedTransaction<T, R>(name: string, initial: () => T, action: (state: T) => R | Promise<R>): Promise<R> {
  const global = name === "analyst" || name === "requests" || name === "provider-prices";
  const owner = global ? "application" : accountId();
  if (!owner) throw new Error("account_required");
  return await database().begin(async (sql) => {
    await sql`insert into stockscope.state (owner, name, value) values (${owner}, ${name}, ${sql.json(initial() as postgres.JSONValue)}) on conflict do nothing`;
    const [row] = await sql`select value from stockscope.state where owner = ${owner} and name = ${name} for update`;
    const state = row.value as T;
    const result = await action(state);
    await sql`update stockscope.state set value = ${sql.json(state as postgres.JSONValue)}, updated_at = now() where owner = ${owner} and name = ${name}`;
    return result;
  }) as R;
}
