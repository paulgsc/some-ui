/**
 * Takes kept (adaptive-learning canon Rem. 4.16): at most forty. None
 * expires and none is evicted; past forty a new take is refused until a
 * confirmed export lets the shared ones go.
 */
export const LENS_TAKES_MAX = 40

/** A take runs at most thirty seconds (Rem. 4.16). */
export const LENS_TAKE_MAX_MS = 30_000
