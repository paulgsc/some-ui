/**
 * A route that declares itself bounded: the shell hands it the window's
 * height and never lets the page scroll behind it (`routes/_dashboard.tsx`).
 *
 * The flag lives on the route rather than in a path list in the shell, so a
 * route under a gate (`_lan`) can be bounded without the public shell naming
 * its path. A bounded route owns fitting its content: fixed chrome around a
 * `min-h-0 flex-1` body, and every pane fits by construction (docs/ui-fit).
 *
 * The session composer and the live session player still decide boundedness
 * by path in the shell, because the player's depends on runtime state (a
 * terminal session is an ordinary document again); the composer could move
 * to this flag.
 */

import { useMatches } from "@tanstack/react-router"

declare module "@tanstack/react-router" {
  // An interface, not a type: declaration merging - how a router's static
  // data is typed - only merges into interfaces.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface StaticDataRouteOption {
    /** See `lib/route-bounds`. */
    bounded?: boolean
  }
}

/** Whether any matched route declares `staticData: { bounded: true }`. */
export function useIsDeclaredBounded(): boolean {
  return useMatches({
    select: (matches) =>
      matches.some((match) => match.staticData.bounded === true),
  })
}
