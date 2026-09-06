/**
 * Height-aware chrome: what a surface keeps when the window is short, and
 * what it gives back.
 *
 * Width breakpoints cannot express this. At 780×390 — a phone held sideways —
 * every Tailwind breakpoint below `md` reads as true, so a layout believes it
 * has a tablet's room while the axis it is actually short of is height. The
 * result is a panel that spends 40px of a 390px window on a sentence
 * congratulating you, and paints its own action button over whatever is laid
 * out next to it.
 *
 * The rule these encode: **on a short window, a surface keeps its controls
 * and sheds its commentary.** Anything read once and then ignored — a
 * first-run explainer, a section heading over a list that is self-evidently
 * that list, an encouraging sentence under a score that already says the same
 * thing — is chrome a short window cannot afford, and every pixel it gives
 * back goes to the thing the surface is actually for.
 *
 * 640px is the threshold: a portrait phone sits well above it (390×780 has
 * 780) and every phone in landscape sits below (390, 430). It is a property
 * of the orientation, not of a device.
 *
 * These are class strings rather than a hook on purpose - the question is
 * answered by CSS at paint time, so nothing has to re-render when a phone is
 * turned over, and a surface rendered inside a granted rect (a session leaf,
 * a Storybook panel) is measured against the same window the person is
 * actually looking at.
 */

/** Shown only when the window is tall enough to spare the room. */
export const TALL_WINDOW_ONLY = "hidden [@media(min-height:640px)]:block"

/** The complement: a compact stand-in shown only when the window is short. */
export const SHORT_WINDOW_ONLY = "flex [@media(min-height:640px)]:hidden"

/** Padding a short window trims and a tall one keeps. */
export const ROOMY_WHEN_TALL = "py-3 [@media(min-height:640px)]:py-6"

/**
 * A label a short window hides *visually* but not from assistive tech.
 *
 * `hidden` would take the accessible name off the control it labels, which is
 * a real regression traded for ~24px. `sr-only` gives the pixels back and
 * keeps the name.
 */
export const LABEL_WHEN_TALL = "sr-only [@media(min-height:640px)]:not-sr-only"
