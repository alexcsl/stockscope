import { AsyncLocalStorage } from "node:async_hooks";

const account = new AsyncLocalStorage<string>();

export function accountId(): string | undefined { return account.getStore(); }
export function withAccountId<T>(id: string, action: () => T): T { return account.run(id, action); }
