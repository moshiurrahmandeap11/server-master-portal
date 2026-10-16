import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  cookies: Map<string, string>;
  headers: Headers;
}

export const requestStore = new AsyncLocalStorage<RequestStore>();

export async function cookies() {
  const store = requestStore.getStore();
  const map = store?.cookies || new Map<string, string>();
  return {
    get(name: string) {
      const value = map.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    getAll() {
      return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    }
  };
}

export async function headers() {
  const store = requestStore.getStore();
  return store?.headers || new Headers();
}
