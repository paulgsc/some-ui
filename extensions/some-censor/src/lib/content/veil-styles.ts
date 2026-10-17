/**
 * Every class string BOYO can put in the DOM, in one place.
 *
 * ## Why this file is the whole stylesheet
 *
 * `uno.config.ts` scans exactly this module and `styles/content.css` — nothing
 * else. So the emitted stylesheet is, by construction, the set of utilities
 * declared below; a class name written anywhere else is not generated and
 * therefore does nothing. That is deliberate: a positive declaration instead
 * of scanning all of `src` and blocklisting words, and the answer to "what can
 * this extension paint?" is one file long.
 *
 * `actuator/veil.ts` consumes these constants and owns the DOM invariants; it
 * does not author class names.
 */

// ─────────────────────────────────────────────────────────────────────────────
// The veil
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structure and glass. `.boyo-veil` leads: the e2e suite finds the veil by
 * it, so the namespace class is load-bearing, not decoration.
 *
 * It takes pointer events so the card under it is inert to the pointer: no
 * hover preview plays under it. Its links stay keyboard-reachable; a plated
 * card is admitted.
 */
export const VEIL =
  "boyo-veil absolute inset-0 z-2 rounded-[inherit] overflow-hidden " +
  "pointer-events-auto " +
  "bg-[rgb(var(--boyo-glass)/86%)] backdrop-blur-20px backdrop-saturate-135"
