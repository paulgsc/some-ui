/**
 * A flat, class-name-shaped **view** over the canonical registry in
 * `../theme/registry.ts`.
 *
 * This file used to be a second registry: it independently listed every class
 * selector shipped in CSS, with its own `ThemeKind` schema and its own
 * membership. `strawberry-moon` and `peachy-blossom` appeared here *and* in the
 * session registry with different metadata, and nothing kept them in step.
 * Everything below is now derived — adding a theme in one place is the only way
 * to add one at all.
 *
 * The `kind` split is preserved because it is the distinction toolbars care
 * about (does this restyle `--primary` on a `.theme-container`, or replace the
 * whole palette on a root?), but it now reads straight off `scope`.
 */

import {
  ACCENT_THEMES,
  FEATURE_APPEARANCES,
  SESSION_THEMES,
  type ThemeDefinition,
} from "../theme/registry"

/**
 * - `color` themes restyle `--primary` (and friends) on `.theme-container`.
 * - `app` themes are full standalone palettes applied to a boundary element —
 *   both the session palettes and the opt-in feature appearances.
 */
export type ThemeKind = "color" | "app"

export type ThemeMeta = {
  /** Stable id used in data attributes / switchers. */
  id: string
  /** Human label. */
  label: string
  /** Class selector that activates the theme. */
  className: string
  kind: ThemeKind
}

function toMeta(theme: ThemeDefinition, kind: ThemeKind): ThemeMeta {
  return {
    id: theme.id,
    label: theme.label,
    // Session themes carry `dark` alongside their palette class; the last
    // entry is the palette itself, which is what a switcher wants to name.
    className:
      theme.boundary.classNames[theme.boundary.classNames.length - 1] ??
      theme.boundary.dataTheme,
    kind,
  }
}

export const colorThemes: ReadonlyArray<ThemeMeta> = ACCENT_THEMES.map((t) =>
  toMeta(t, "color")
)

export const appThemes: ReadonlyArray<ThemeMeta> = [
  ...FEATURE_APPEARANCES,
  ...SESSION_THEMES.filter((t) => t.boundary.classNames.length > 0),
].map((t) => toMeta(t, "app"))

export const themes: ReadonlyArray<ThemeMeta> = [...colorThemes, ...appThemes]

export const themeIds = themes.map((t) => t.id)
