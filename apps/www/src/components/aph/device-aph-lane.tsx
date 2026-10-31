/**
 * Hands aph's lane to the app shell's drain and the header's mark
 * (`components/device-home-glyph.tsx`) while aph's screens are mounted
 * (LA15, docs/learner-data-authority.md). Phone-only (`build.paths.ts`).
 */
import type { AphKeeping } from "@/lib/home-link/aph"
import { aphLane } from "@/lib/home-link/aph"
import { useHandLane } from "@/lib/home-link/lanes"

export const DeviceAphLane = ({ aph }: { aph: AphKeeping }): null => {
  useHandLane(aphLane(aph))
  return null
}
