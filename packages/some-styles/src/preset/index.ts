import { definePreset, presetWind4 } from "unocss"
import type { Preset } from "unocss"

import { shortcuts } from "./shortcuts"
import { someUiTheme } from "./theme"

export type PresetSomeUiOptions = {
  /**
   * Emit the base reset (preflight). Off by default — browser extensions
   * are typically injected into existing pages, so a global reset is opt-in
   * to avoid clobbering host-page styles. Enable it for self-contained
   * surfaces like popups and options pages.
   *
   * @default false
   */
  preflight?: boolean

  /**
   * Dark mode strategy passed through to presetWind4.
   *
   * @default "class"
   */
  dark?: "class" | "media"
}

/**
 * `presetSomeUi` — the shared UnoCSS preset for the monorepo.
 *
 * Composes Tailwind v4-compatible utilities (presetWind4 — matching the
 * repo's existing oklch / Tailwind v4 surface) and layers on the shadcn
 * design system: token-driven colors with `color-mix` opacity, a
 * single-source radius scale, and component shortcuts. The result is
 * familiar, ergonomic class authoring at dev time that compiles down to plain
 * static CSS at build time — no CSS engine ships to the browser extension.
 *
 * Pair the generated utility CSS with `@some-ui/styles/tokens.css` (and any
 * theme files) at runtime to supply the custom-property values.
 */
export const presetSomeUi = definePreset(
  (options: PresetSomeUiOptions = {}): Preset => {
    const { preflight = false, dark = "class" } = options

    return {
      name: "@some-ui/styles/preset",
      // The token theme is layered as a sub-preset *after* presetWind4 so it
      // reliably overrides Wind's defaults (a `theme` block on the parent
      // preset would lose to its nested preset). The full Wind palette stays
      // available alongside our tokens.
      presets: [
        presetWind4({ dark, preflight }),
        { name: "@some-ui/styles/theme", theme: someUiTheme },
      ],
      shortcuts,
    }
  }
)

export default presetSomeUi

export { shortcuts } from "./shortcuts"
export { colors, radius, someUiTheme } from "./theme"
export type { ThemeKind, ThemeMeta } from "./themes"
export { appThemes, colorThemes, themeIds, themes } from "./themes"
