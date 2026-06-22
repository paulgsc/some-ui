/**
 * Theme registry.
 *
 * Each entry corresponds to a class selector shipped in the CSS token files.
 * This is the JS-side source of truth for theme metadata — useful for
 * building theme switchers, Storybook toolbars, and docs without re-parsing
 * CSS.
 *
 * - `color` themes restyle `--primary` (and friends) on `.theme-container`.
 *   They layer on top of light/dark and live in `themes.css`.
 * - `app` themes are full standalone palettes (their own background /
 *   foreground), applied to a root element. They live in `themes/*.css`.
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

export const colorThemes: ReadonlyArray<ThemeMeta> = [
  {
    id: "default",
    label: "Default",
    className: "theme-default",
    kind: "color",
  },
  { id: "blue", label: "Blue", className: "theme-blue", kind: "color" },
  { id: "green", label: "Green", className: "theme-green", kind: "color" },
  { id: "amber", label: "Amber", className: "theme-amber", kind: "color" },
  { id: "rose", label: "Rose", className: "theme-rose", kind: "color" },
  { id: "purple", label: "Purple", className: "theme-purple", kind: "color" },
  { id: "orange", label: "Orange", className: "theme-orange", kind: "color" },
  { id: "teal", label: "Teal", className: "theme-teal", kind: "color" },
  { id: "red", label: "Red", className: "theme-red", kind: "color" },
  { id: "yellow", label: "Yellow", className: "theme-yellow", kind: "color" },
  { id: "violet", label: "Violet", className: "theme-violet", kind: "color" },
  { id: "mono", label: "Mono", className: "theme-mono", kind: "color" },
  { id: "scaled", label: "Scaled", className: "theme-scaled", kind: "color" },
]

export const appThemes: ReadonlyArray<ThemeMeta> = [
  { id: "scheduler", label: "Scheduler", className: "scheduler", kind: "app" },
  { id: "code", label: "Code", className: "code", kind: "app" },
  { id: "cdrama", label: "C-Drama", className: "cdrama", kind: "app" },
  { id: "topik", label: "Topik", className: "topik", kind: "app" },
  { id: "headline", label: "Headline", className: "headline", kind: "app" },
  { id: "conveyor", label: "Conveyor", className: "conveyor", kind: "app" },
]

export const themes: ReadonlyArray<ThemeMeta> = [...colorThemes, ...appThemes]

export const themeIds = themes.map((t) => t.id)
