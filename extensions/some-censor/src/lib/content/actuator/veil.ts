/**
 * The veil (BC4): the occluding layer over a plated card until the plate
 * replaces it (#1804), as a function the Actuator owns.
 *
 * Design property (a label for citation, not a declared review invariant):
 *
 *   D5 — No class names here. Every class string comes from veil-styles.ts,
 *        which is the only file UnoCSS scans; a literal written here would
 *        not be generated and so would silently do nothing.
 *
 * It carries nothing from the card: no hint, no channel, no title (QD4).
 */

import { VEIL } from "@censor/lib/content/veil-styles"

/** Create an occluding veil element, not yet attached. */
export function createVeil(doc: Document): HTMLElement {
  const v = doc.createElement("div")
  v.className = VEIL
  return v
}
