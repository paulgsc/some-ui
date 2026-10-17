/**
 * The page-wide half of the on/off switch (#1807), as a write the Actuator
 * owns: `content.css` keys every pre-mask rule to the absence of
 * {@link SWITCHED_OFF_ATTRIBUTE} on `<html>`.
 */

import { SWITCHED_OFF_ATTRIBUTE } from "@censor/lib/content/selectors"

export function setSwitchedOff(doc: Document, off: boolean): void {
  doc.documentElement.toggleAttribute(SWITCHED_OFF_ATTRIBUTE, off)
}
