/**
 * The DOM theme boundary — the one thing a reusable component is allowed to
 * know about theming.
 *
 * A boundary is a class plus a data attribute on an element. Everything below
 * it inherits that element's custom properties, which is the whole protocol:
 * no context, no hook, no framework. A component that renders inside *any*
 * boundary — a session theme on `<html>`, a feature appearance a host mounted
 * three levels up — gets the right tokens by inheritance alone.
 *
 * The helpers here exist so a component that legitimately takes an
 * `appearance` prop has one shared way to spell it, instead of each package
 * re-deriving `className={appearance === "code" && "code"}` and drifting.
 * `appearanceProps("inherit")` returns nothing at all — the default case
 * genuinely is "do not open a boundary".
 */

import type { FeatureAppearanceId, ThemeDefinition } from "./registry"
import { getFeatureAppearance } from "./registry"

/**
 * What a component accepts for art direction. `inherit` — the only sane
 * default for reusable UI — means "render in whatever theme the host already
 * established".
 */
export type Appearance = "inherit" | FeatureAppearanceId

/**
 * The attributes that open a feature boundary, ready to spread onto an
 * element. Named for the DOM/JSX spelling because every host in this repo is
 * JSX today; a non-JSX host reads `className` as `class` and sets the data
 * attribute directly.
 */
export type BoundaryProps = {
  className?: string
  "data-appearance"?: string
}

/**
 * Attributes for a feature boundary, or an empty object for `inherit`.
 *
 * Note what this deliberately does *not* do: it never emits `dark`, and it has
 * no access to the session registry. A component cannot use this helper to
 * pick the user's theme even by accident — the type only admits feature ids.
 */
export function appearanceProps(appearance: Appearance): BoundaryProps {
  if (appearance === "inherit") return {}
  const meta = getFeatureAppearance(appearance)
  if (!meta) return {}
  return {
    className: meta.boundary.classNames.join(" "),
    "data-appearance": meta.boundary.dataTheme,
  }
}

/**
 * Just the class list for a feature appearance — for the common case of
 * folding it into an existing `cn(...)` call.
 */
export function appearanceClassName(appearance: Appearance): string {
  return appearanceProps(appearance).className ?? ""
}

/**
 * Apply a feature boundary to an element imperatively, for hosts that build
 * DOM without JSX (a plain script, a shadow-root mount, a portal container the
 * host owns). Returns the metadata applied, or `null` for `inherit`.
 */
export function applyAppearance(
  element: HTMLElement,
  appearance: Appearance
): ThemeDefinition | null {
  for (const id of Array.from(element.classList)) {
    if (getFeatureAppearance(id)) element.classList.remove(id)
  }
  delete element.dataset.appearance

  if (appearance === "inherit") return null
  const meta = getFeatureAppearance(appearance)
  if (!meta) return null

  element.classList.add(...meta.boundary.classNames)
  element.dataset.appearance = meta.boundary.dataTheme
  return meta
}
