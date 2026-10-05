/**
 * Height-aware chrome: what a surface keeps when the window is short, and
 * what it gives back.
 *
 * Width breakpoints cannot express this: at 780×390 (a phone sideways) every
 * breakpoint below `md` is true while the axis actually short is height.
 *
 * The rule: **on a short window, a surface keeps its controls and sheds its
 * commentary** (first-run explainers, self-evident headings, encouragement
 * under a score).
 *
 * 640px sits above every landscape phone and below every portrait one: a
 * property of orientation, not device.
 *
 * Class strings rather than a hook: CSS answers at paint time, so nothing
 * re-renders on rotation, and a surface inside a granted rect is measured
 * against the real window.
 */

/** Shown only when the window is tall enough to spare the room. */
export const TALL_WINDOW_ONLY = "hidden [@media(min-height:640px)]:block"

/** The complement: a compact stand-in shown only when the window is short. */
export const SHORT_WINDOW_ONLY = "flex [@media(min-height:640px)]:hidden"

/** Padding a short window trims and a tall one keeps. */
export const ROOMY_WHEN_TALL = "py-3 [@media(min-height:640px)]:py-6"

/**
 * A label a short window hides visually but not from assistive tech
 * (`hidden` would drop the control's accessible name).

 */
export const LABEL_WHEN_TALL = "sr-only [@media(min-height:640px)]:not-sr-only"
