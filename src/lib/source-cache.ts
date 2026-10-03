const stores = new WeakMap<typeof fetch, Map<string, { expires: number; pending: boolean; promise: Promise<unknown> }>>();

export function cachedSource<T>(key: string, seconds: number, load: () => Promise<T>, fetcher: typeof fetch = fetch): Promise<T> {
  let store = stores.get(fetcher);
  if (!store) { store = new Map(); stores.set(fetcher, store); }
  const existing = store.get(key);
  if (existing && (existing.pending || existing.expires > Date.now())) return existing.promise as Promise<T>;
  const promise = Promise.resolve().then(load).then((result) => {
    const current = store!.get(key);
    if (current?.promise === promise) { current.pending = false; current.expires = Date.now() + seconds * 1000; }
    return result;
  }).catch((error) => { if (store!.get(key)?.promise === promise) store!.delete(key); throw error; });
  if (store.size >= 256) {
    for (const [entry, value] of store) if (value.expires <= Date.now()) store.delete(entry);
    if (store.size >= 256) store.delete(store.keys().next().value!);
  }
  store.set(key, { expires: Date.now() + seconds * 1000, pending: true, promise });
  return promise;
}
