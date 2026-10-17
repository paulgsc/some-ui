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
import { createInMemoryStorage } from "@/lib/tenant/storage"

if (VIEWER_BUILD && typeof window !== "undefined") {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(window, name, {
      value: createInMemoryStorage(),
      configurable: true,
    })
  }
}
