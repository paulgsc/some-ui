/**
 * The page-wide writes that follow the owner's settings, as writes the
 * Actuator owns: the on/off switch (#1807), to whose absence
 * `content.css` keys every pre-mask rule, and the mode's page rules
 * (#1966).
 */

import {
  LOADING_ATTRIBUTE,
  POSTS_ATTRIBUTE,
  SWITCHED_OFF_ATTRIBUTE,
} from "@censor/lib/content/selectors"
import type { PageRules } from "@censor/lib/settings/modes"

export function setSwitchedOff(doc: Document, off: boolean): void {
  doc.documentElement.toggleAttribute(SWITCHED_OFF_ATTRIBUTE, off)
}

export function setPageRules(doc: Document, rules: PageRules): void {
  const root = doc.documentElement
  root.setAttribute(POSTS_ATTRIBUTE, rules.posts)
  root.setAttribute(LOADING_ATTRIBUTE, rules.loading)
}
