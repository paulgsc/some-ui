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
 * These helpers give a component that takes an `appearance` prop one shared
 * spelling. `appearanceProps("inherit")` returns nothing: the default is "do
 * not open a boundary".
 *
 */

import type {
  FeatureAppearanceId,
  SessionThemeId,
  ThemeDefinition,
} from "./registry"
import { getFeatureAppearance, getSessionTheme } from "./registry"

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

/**
 * Attributes that draw a subtree in one of the app's themes, when what the
 * subtree shows chooses it and the person reading does not: a video
 * template's frame (SFEED10), which looks the same whatever theme the app is
 * in, and the mark on its brand slides (SFEED12). The host passes the id; a
 * reusable component never picks one. `ground: false` leaves the subtree's
 * ground to what is around it, for a mark drawn in another theme than its
 * frame.
 */
export function sessionThemeProps(
  id: SessionThemeId,
  { ground = true }: { readonly ground?: boolean } = {}
): BoundaryProps & {
  "data-theme": string
  style: { colorScheme: "light" | "dark"; backgroundColor?: "transparent" }
} {
  const theme = getSessionTheme(id)
  return {
    className: theme?.boundary.classNames.join(" ") ?? "",
    "data-theme": theme?.boundary.dataTheme ?? id,
    style: {
      colorScheme: theme?.mode ?? "light",
      ...(ground ? {} : { backgroundColor: "transparent" as const }),
    },
  }
}
