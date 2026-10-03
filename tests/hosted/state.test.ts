import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../../src/lib/local-store";
import { database } from "../../src/lib/hosted-store";
import { accountId, withAccountId } from "../../src/lib/account-context";

const first = `validation:${randomUUID()}`;
const second = `validation:${randomUUID()}`;
after(async () => {
  await database()`delete from stockscope.state where owner in (${first}, ${second})`;
  await database().end({ timeout: 1 });
});

test("hosted records persist across instances and remain isolated by account", async () => {
  await withAccountId(first, () => new LocalStore("validation", () => ({ count: 0 })).transaction((state) => { state.count = 7; }));
  assert.equal(await withAccountId(first, () => new LocalStore("validation", () => ({ count: 0 })).transaction((state) => state.count)), 7);
  assert.equal(await withAccountId(second, () => new LocalStore("validation", () => ({ count: 0 })).transaction((state) => state.count)), 0);
  await assert.rejects(new LocalStore("validation", () => ({})).transaction(() => true), /account_required/);
});

test("database row locks prevent lost updates and roll back failed callbacks", async () => {
  const store = new LocalStore("counter", () => ({ count: 0 }));
  await Promise.all(Array.from({ length: 20 }, () => withAccountId(first, () => store.transaction(async (state) => { const value = state.count; await new Promise((resolve) => setTimeout(resolve, 2)); state.count = value + 1; }))));
  assert.equal(await withAccountId(first, () => store.transaction((state) => state.count)), 20);
  await assert.rejects(withAccountId(first, () => store.transaction((state) => { state.count = 999; throw new Error("rollback"); })), /rollback/);
  assert.equal(await withAccountId(first, () => store.transaction((state) => state.count)), 20);
});

test("concurrent request contexts cannot inherit another account", async () => {
  const result = await Promise.all([first, second].map((owner) => withAccountId(owner, async () => { await new Promise((resolve) => setTimeout(resolve, 5)); return accountId(); })));
  assert.deepEqual(result, [first, second]);
  assert.equal(accountId(), undefined);
});

test("the hosted database role cannot read Supabase authentication records", async () => {
  await assert.rejects(database()`select id from auth.users limit 1`, (error: unknown) => (error as { code?: string }).code === "42501");
});
