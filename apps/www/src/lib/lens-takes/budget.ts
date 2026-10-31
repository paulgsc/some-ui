/**
 * Takes kept (adaptive-learning canon Rem. 4.16): at most forty, an offline
 * set. None expires, and none leaves before home holds it: past forty a new
 * take lets go the oldest home holds, and is refused while home holds none
 * (HF5, #2180).
 */
export const LENS_TAKES_MAX = 40

/** A take runs at most thirty seconds (Rem. 4.16). */
export const LENS_TAKE_MAX_MS = 30_000
