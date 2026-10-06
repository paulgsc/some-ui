/**
 * Guarantees a working `localStorage` in the jsdom tests, whatever Node runs.
 *
 * Symptom: `TypeError: window.localStorage.clear is not a function`, in CI
 * only. Vitest's `populateGlobal` skips copying jsdom's window keys that the
 * runtime already defines (`if (k in global) return keysArray.includes(k)`),
 * and Node 22+ ships a global `localStorage` which, without a valid
 * `--localstorage-file`, is not a usable `Storage`. CI's `nodejs_latest`
 * (`nix/node`) is ahead of contributors' Node.
 *
 * Conditional: where a real `Storage` exists it does nothing, so it cannot
 * mask a regression in code under test. The lasting fix is pinning Node.
 */

/** Everything the `Storage` interface promises, in memory. */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()

  class MemoryStorage implements Storage {
    get length(): number {
      return entries.size
    }

    key(index: number): string | null {
      return Array.from(entries.keys())[index] ?? null
    }

    getItem(key: string): string | null {
      return entries.get(key) ?? null
    }

    setItem(key: string, value: string): void {
      entries.set(key, String(value))
    }

    removeItem(key: string): void {
      entries.delete(key)
    }

    clear(): void {
      entries.clear()
    }
  }

  return new MemoryStorage()
}

/**
 * A `Storage` in name only passes a `typeof` check and throws on first call,
 * so probe the methods the tests use.
 */
function isUsableStorage(candidate: unknown): boolean {
  if (typeof candidate !== "object" || candidate === null) return false

  return (
    "getItem" in candidate &&
    typeof candidate.getItem === "function" &&
    "setItem" in candidate &&
    typeof candidate.setItem === "function" &&
    "removeItem" in candidate &&
    typeof candidate.removeItem === "function" &&
    "clear" in candidate &&
    typeof candidate.clear === "function"
  )
}

function ensureStorage(name: "localStorage" | "sessionStorage"): void {
  if (isUsableStorage(Reflect.get(globalThis, name))) return

  const storage = createMemoryStorage()
  const descriptor = { value: storage, writable: true, configurable: true }
  Object.defineProperty(globalThis, name, descriptor)
  // jsdom's `window` is a separate object from `globalThis` under some
  // Vitest versions, and the tests reach for `window.localStorage` by name.
  if (typeof window !== "undefined" && !Object.is(window, globalThis)) {
    Object.defineProperty(window, name, descriptor)
  }
}

ensureStorage("localStorage")
ensureStorage("sessionStorage")
