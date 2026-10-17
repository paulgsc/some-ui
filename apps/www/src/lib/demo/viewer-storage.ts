/**
 * On the Pages build, the page's `localStorage` and `sessionStorage` are
 * in-memory copies (CLAUDE.md, "A viewer tries, and nothing is kept"): every
 * store, in www and in the activity packages alike, reads and writes them as
 * before, and a reload starts over. Imported first by `main.tsx`, so no
 * module reads the browser's storage before the copies are in place. The
 * theme script in `index.html` runs earlier still and may read a remembered
 * theme; what a viewer changes is not kept.
 */
import { VIEWER_BUILD } from "@/lib/data-mode"

/** A `Storage` that lives as long as the page. */
export function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length(): number {
      return items.size
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value): void => {
      items.set(key, String(value))
    },
    removeItem: (key): void => {
      items.delete(key)
    },
    clear: (): void => {
      items.clear()
    },
  }
}

if (VIEWER_BUILD && typeof window !== "undefined") {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(window, name, {
      value: memoryStorage(),
      configurable: true,
    })
  }
}
