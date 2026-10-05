import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

/**
 * Guarantee a working `localStorage` / `sessionStorage` for the package's
 * tests.
 *
 * Node 22.4+ ships inert Web Storage globals (without `--localstorage-file`),
 * and they survive Vitest copying jsdom's `window` onto `globalThis`, leaving
 * a `localStorage` with no `Storage` methods ("clear is not a function"). It
 * bites only on newer Node (CI's nix shell), and `window` is already gone by
 * now, so the repair installs a real store on `globalThis`, which tests and
 * code both read.
 *
 * Exported for `vitest.setup.test.ts`, which pins the repair on every Node
 * version.
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

/**
 * jsdom has no `Element.prototype.scrollIntoView`, which `TypingViewport`
 * calls unconditionally (rightly; the gap is the test environment's). The
 * descriptor check is needed because the DOM types claim it always exists.
 */
if (
  Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView") ===
  undefined
) {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: function scrollIntoView(): void {
      // Nothing in jsdom scrolls, so there is nothing to do.
    },
  })
}

ensureUsableWebStorage(globalThis)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})
