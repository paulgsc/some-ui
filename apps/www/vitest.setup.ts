/**
 * Guarantees a working `localStorage` in the jsdom tests, whatever Node the
 * runner happens to be.
 *
 * The failure this exists for looks like a test bug and is not one:
 *
 *    TypeError: window.localStorage.clear is not a function
 *
 * from CI only, on a test that passes on every developer machine. The cause
 * is an interaction between the runtime and Vitest's jsdom environment.
 * `populateGlobal` copies jsdom's window properties onto the global object,
 * but it deliberately skips any key the runtime already defines and that is
 * not in its own KEYS list:
 *
 *    if (k in global) return keysArray.includes(k)
 *
 * `localStorage` is not in that list. Node ships Web Storage from v22
 * onwards (enabled by default in recent majors), so on a new enough Node
 * there *is* a global `localStorage` before jsdom is installed - and jsdom's
 * own is therefore never copied. What the tests then touch is Node's
 * object, which without a valid `--localstorage-file` is not a usable
 * `Storage` at all: no `clear`, no `key`, no `length`. Older Node has no
 * global `localStorage`, jsdom's gets copied, and everything works. That is
 * the entire "passes locally, fails in CI" delta - CI resolves its Node
 * through `nix/node`'s `nodejs_latest`, which is by definition ahead of
 * whatever a contributor has installed.
 *
 * The shim is deliberately conditional: where the environment already
 * provides a real `Storage` (any current developer machine), it does
 * nothing at all and tests keep using jsdom's. It only steps in where the
 * ambient object cannot do the job, so this cannot mask a genuine
 * regression in code under test - only the runtime's own gap.
 *
 * The lasting fix is pinning that Node rather than tracking `latest`; this
 * keeps the suite honest either way, and would go on doing so the next time
 * a runtime grows a global that jsdom also defines.
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
 * A `Storage` in name only is worse than none: it satisfies a `typeof`
 * check and then throws on the first call, which is exactly how this
 * surfaced. Probe the methods the tests actually use.
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
