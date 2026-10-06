/**
 * A flat, class-name-shaped **view** over the canonical registry in
 * `../theme/registry.ts`; everything here is derived.
 *
 * `kind` is the distinction toolbars care about (restyle `--primary` on a
 * `.theme-container`, or replace the whole palette on a root?), read off
 * `scope`.
 *
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
