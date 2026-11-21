/**
 * Tells ENGAGE which of an affordance's places is on screen while the
 * calling screen shows (`@some-ui/engagement`'s `createPlaces`): a `taken`
 * as a place comes on, a `left` naming it as it goes, the app put away or
 * the screen closed included (`watchPlaces`). The pure step and its rules
 * are the engagement package's; this only holds its runtime for a mount.
 */
import { useEffect, useMemo } from "react"
import type { PlaceOf } from "@some-ui/engagement"
import { createPlaces, watchPlaces } from "@some-ui/engagement"

export function usePlace(of: PlaceOf, place: string | null): void {
  const { pipeline, affordance, surface } = of
  // A new runtime per affordance: what is open is the affordance's own.
  const places = useMemo(
    () => createPlaces({ pipeline, affordance, surface }),
    [pipeline, affordance, surface]
  )
  useEffect(() => watchPlaces(places, document), [places])
  useEffect(() => {
    places.at(place)
  }, [places, place])
}
