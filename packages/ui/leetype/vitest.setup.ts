import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

/**
 * Guarantee a working `localStorage` / `sessionStorage` for the whole
 * package's tests.
 *
 * Node ships Web Storage globals of its own from v22.4 onward, and they are
 * inert unless the process was started with `--localstorage-file`. Vitest's
 * jsdom environment copies jsdom's `window` onto `globalThis` (there is no
 * separate `window` afterwards — `window === globalThis`), and a binding
 * Node installed first survives that copy. The result is a `localStorage`
 * that exists but has none of the `Storage` methods, so the first
 * `localStorage.clear()` in a `beforeEach` dies with "clear is not a
 * function" and takes every test in the file with it.
 *
 * It only bites in CI: the nix devshell pins `nodejs_latest`, which has
 * crossed that boundary, while local Node 22 defines no such global and
 * jsdom's storage wins uncontested. Since `window` is already gone by the
 * time this runs, there is nothing to re-point at — the repair is to
 * install a real store. Tests and the code under test both read
 * `globalThis`, so they share it, which is the part that actually matters.
 *
 * Exported for `vitest.setup.test.ts`, which pins the repair behavior on
 * every Node version rather than only the one CI happens to run.
 */
export function ensureUsableWebStorage(target: typeof globalThis): void {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    if (isUsableStorage(target[key])) continue

    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value: createMemoryStorage(),
    })
  }
}

/**
 * The global is typed as a `Storage` but may be absent (older Node) or a
 * method-less stub (newer Node), so this asks the value itself rather than
 * trusting the type.
 */
function isUsableStorage(value: unknown): value is Storage {
  return (
    typeof value === "object" &&
    value !== null &&
    "clear" in value &&
    typeof value.clear === "function"
  )
}

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()

  return {
    get length(): number {
      return entries.size
    },
    clear(): void {
      entries.clear()
    },
    getItem(key: string): string | null {
      return entries.get(String(key)) ?? null
    },
    key(index: number): string | null {
      return [...entries.keys()][index] ?? null
    },
    removeItem(key: string): void {
      entries.delete(String(key))
    },
    setItem(key: string, value: string): void {
      entries.set(String(key), String(value))
    },
  }
}

ensureUsableWebStorage(globalThis)

afterEach(() => {
  // Cleans up the DOM (rendered hooks)
  cleanup()
  // Clears all mock call history and resets timers
  vi.clearAllMocks()
  vi.useRealTimers()
})
