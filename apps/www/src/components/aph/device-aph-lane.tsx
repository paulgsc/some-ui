/**
 * Hands aph's lane to the app shell's drain and the header's mark
 * (`components/device-home-glyph.tsx`) while aph's screens are mounted
 * (LA15, docs/learner-data-authority.md), and reads home's record as they
 * open (AR1). Phone-only (`build.paths.ts`).
 */
import { useEffect } from "react"

import type { AphKeeping } from "@/lib/home-link/aph"
import { aphLane, readAphOnOpen } from "@/lib/home-link/aph"
import { useHandLane } from "@/lib/home-link/lanes"

export const DeviceAphLane = ({ aph }: { aph: AphKeeping }): null => {
  useHandLane(aphLane(aph))
  // Home's record, read as the screens open (AR1).
  useEffect(() => readAphOnOpen(aph), [aph])
  return null
}
