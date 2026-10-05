/**
 * A route that declares itself bounded: the shell hands it the window's
 * height and never lets the page scroll behind it (`routes/_dashboard.tsx`).
 * On the route, not a path list in the shell, so a gated route needn't be
 * named publicly. A bounded route fits its own content (docs/ui-fit).
 *
 * The composer and live player are still bounded by path in the shell (the
 * player's depends on runtime state); the composer could move to this flag.
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
