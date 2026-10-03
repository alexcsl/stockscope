import { mkdir, readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hostedConfigured, hostedTransaction } from "./hosted-store";

export class LocalStore<T> {
  constructor(private name: string, private initial: () => T, private directory = process.env.STOCKSCOPE_DATA_DIR || resolve(".stockscope")) {}

  async transaction<R>(action: (state: T) => R | Promise<R>): Promise<R> {
    if (hostedConfigured() && this.directory === (process.env.STOCKSCOPE_DATA_DIR || resolve(".stockscope"))) return hostedTransaction(this.name, this.initial, action);
    if (process.env.VERCEL === "1") throw new Error("storage_not_configured");
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${this.name}.json`);
    const lockPath = `${path}.lock`;
    let lock;
    for (let attempts = 0; attempts < 100; attempts++) {
      try { lock = await open(lockPath, "wx"); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await new Promise((resolve) => setTimeout(resolve, 20)); }
    }
    if (!lock) throw new Error("storage_busy");
    try {
      let state: T;
      try { state = JSON.parse(await readFile(path, "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = this.initial(); }
      const result = await action(state);
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      await rename(temporary, path);
      return result;
    } finally { await lock.close(); await unlink(lockPath); }
  }
}
