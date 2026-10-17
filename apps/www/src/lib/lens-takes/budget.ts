import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"

/**
 * Takes kept (adaptive-learning canon Rem. 4.16): at most forty. None
 * expires and none is evicted; past forty a new take is refused until a
 * confirmed export lets the shared ones go.
 */
export const LENS_TAKES_MAX = 40

/** A take runs at most thirty seconds (Rem. 4.16). */
export const LENS_TAKE_MAX_MS = 30_000

/**
 * The shelf's own cap: forty full-length takes at the soundbites' bitrate.
 * Nothing keeps it free; the device's measured budget (`withRoom`) still
 * refuses a take the phone has no room for.
 */
export const LENS_TAKES_MAX_BYTES =
  LENS_TAKES_MAX * (LENS_TAKE_MAX_MS / 1000) * (SOUNDBITE_BITS_PER_SECOND / 8)
