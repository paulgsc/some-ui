/**
 * Selectable app themes — the top-level palettes a user picks in a theme
 * switcher. This is the presentation-layer registry (distinct from
 * `preset/themes.ts`, which is the exhaustive metadata list of every class
 * selector shipped in CSS). Kept here, in the design-system package, so every
 * consuming app switches over the same source of truth instead of hardcoding
 * class names.
 *
 * Each theme maps to the root classes that activate it (see tokens/base.css
 * and themes/*.css) plus a small swatch used to render preview chips.
 */

export type ThemeMode = "light" | "dark"

export type ThemeSwatch = {
  /** Background sample. */
  bg: string
  /** Foreground / text sample. */
  fg: string
  /** Primary / accent sample. */
  accent: string
}

export type AppTheme = {
  /** Stable id persisted as the user's preference. */
  id: string
  /** Human label for the switcher. */
  label: string
  /** Whether native `color-scheme` should report light or dark. */
  mode: ThemeMode
  /**
   * Classes added to the root element to activate this theme. Order does not
   * matter; `dark` is included for dark palettes so shared `.dark` component
   * styles resolve alongside the standalone app-theme class.
   */
  classNames: ReadonlyArray<string>
  swatch: ThemeSwatch
}

export const APP_THEMES = [
  {
    id: "light",
    label: "Light",
    mode: "light",
    classNames: [],
    swatch: {
      bg: "oklch(1 0 0)",
      fg: "oklch(0.145 0 0)",
      accent: "oklch(0.205 0 0)",
    },
  },
  {
    id: "dark",
    label: "Dark",
    mode: "dark",
    classNames: ["dark"],
    swatch: {
      bg: "oklch(0.145 0 0)",
      fg: "oklch(0.9 0.004 260)",
      accent: "oklch(0.922 0 0)",
    },
  },
  {
    id: "strawberry-moon",
    label: "Strawberry Moon",
    mode: "dark",
    classNames: ["dark", "strawberry-moon"],
    swatch: {
      bg: "oklch(0.16 0.03 350)",
      fg: "oklch(0.88 0.02 350)",
      accent: "oklch(0.68 0.19 15)",
    },
  },
  {
    id: "peachy-blossom",
    label: "Peachy Blossom",
    mode: "light",
    classNames: ["peachy-blossom"],
    swatch: {
      bg: "oklch(0.98 0.02 60)",
      fg: "oklch(0.34 0.04 40)",
      accent: "oklch(0.74 0.16 25)",
    },
  },
] as const satisfies ReadonlyArray<AppTheme>

export type AppThemeId = (typeof APP_THEMES)[number]["id"]

export const APP_THEME_IDS: ReadonlyArray<AppThemeId> = APP_THEMES.map(
  (t) => t.id
)

/** Every distinct root class any theme can add — used to clear before apply. */
export const ALL_THEME_CLASSES: ReadonlyArray<string> = Array.from(
  new Set(APP_THEMES.flatMap((t) => t.classNames))
)

export function getAppTheme(id: string): AppTheme | undefined {
  return APP_THEMES.find((t) => t.id === id)
}
