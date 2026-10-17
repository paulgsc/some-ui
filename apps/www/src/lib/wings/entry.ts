import type { FileRoutesByTo } from "@/routeTree.gen"

import { hasAudience } from "@/lib/build-profile"

import { FOYER, WINGS } from "./index"

type Path = keyof FileRoutesByTo

/**
 * The roots a wing's launcher icon may open, and the foyer. apps/mobile's
 * `MainActivity` maps each icon to one of these from a fixed table
 * (`routes/__tests__/mobile-surface.test.ts` checks the two agree), never
 * from anything the intent carries.
 */
export const ENTRY_ROOTS: ReadonlyArray<Path> = [
  FOYER,
  ...WINGS.flatMap((wing) => (wing.home === null ? [] : [wing.home])),
]

/** `root` as one of `ENTRY_ROOTS`, or undefined for anything else. */
export function entryRoot(root: unknown): Path | undefined {
  return ENTRY_ROOTS.find((known) => known === root)
}

/**
 * A wing's icon tapped while the app is already open: `MainActivity` sends
 * `someui:wing` with the root instead of reloading the page, so whatever is
 * in flight (a recording, a write to the database) is not cut off. A cold
 * start needs nothing here: the page simply loads at that root.
 *
 * Installed once, at module scope in main.tsx, before the page finishes
 * loading; a no-op in a build without the phone's pages (A3), which are the
 * only ones a launcher icon opens.
 */
export function listenForWingEntry(navigate: (to: Path) => void): void {
  if (!hasAudience("apk")) return
  window.addEventListener("someui:wing", (event) => {
    // Capacitor copies the event's data onto the event object itself.
    const root = entryRoot("root" in event ? event.root : undefined)
    if (root !== undefined) navigate(root)
  })
}
