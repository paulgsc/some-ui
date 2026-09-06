/**
 * Height-aware visibility for the composer's chrome.
 *
 * Width breakpoints (`sm:`, `md:`) cannot express what a landscape phone
 * needs. At 780×390 every width breakpoint below `md` is *true* — the layout
 * believes it has a tablet — while the axis that is actually scarce, height,
 * has 390px to spend on a header, a step rail, a body and a nav row. The
 * result is a wizard whose explanatory prose is taller than the catalogue it
 * explains.
 *
 * So the rule the composer follows is: on a short window, the step keeps its
 * controls and sheds its commentary. Anything that is read once and then
 * ignored — a first-run explainer, a section heading over a list that is
 * self-evidently that list — is chrome the short window cannot afford, and
 * every pixel it gives back goes to the one thing the step is actually for.
 *
 * 640px is where a portrait phone sits comfortably above (a 390×780 window
 * has 780) and every landscape phone sits below (390, 430). It is a property
 * of the orientation, not of a device.
 */
export const TALL_WINDOW_ONLY = "hidden [@media(min-height:640px)]:block"

/** Padding that a short window trims and a tall one keeps. */
export const ROOMY_WHEN_TALL = "py-3 [@media(min-height:640px)]:py-6"

/**
 * A label a short window hides *visually* but not from assistive tech.
 *
 * `hidden` would take the accessible name off the control it labels, which is
 * a real regression traded for ~24px. `sr-only` gives the pixels back and
 * keeps the name.
 */
export const LABEL_WHEN_TALL = "sr-only [@media(min-height:640px)]:not-sr-only"

/** The complement of {@link TALL_WINDOW_ONLY}: a compact stand-in shown only when the window is short. */
export const SHORT_WINDOW_ONLY = "flex [@media(min-height:640px)]:hidden"
