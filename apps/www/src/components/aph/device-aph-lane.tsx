/**
 * Hands aph's lane to the header's mark while aph's screens are mounted
 * (LA9, docs/learner-data-authority.md): `@some-ui/aph` is the phone's
 * alone, so the route hands its store and exchanges in (`AphKeeping`), and
 * the mark (`components/device-home-glyph.tsx`) shows it. Phone-only
 * (`build.paths.ts`).
 */
import type { AphKeeping } from "@/lib/home-link/aph"
import { aphLane } from "@/lib/home-link/aph"
import { useHandLane } from "@/lib/home-link/lanes"

export const DeviceAphLane = ({ aph }: { aph: AphKeeping }): null => {
  useHandLane(aphLane(aph))
  return null
}
