/**
 * Web preview fallback: browsers have no keychain, so tokens go to localStorage.
 * The web build is a design/QA preview only — it is not a production target.
 */
function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    return storage()?.getItem(key) ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    storage()?.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    storage()?.removeItem(key);
  },
};
