import {
  defineConfig,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss"
import type { UserConfig } from "unocss"

import { presetSomeUi, type PresetSomeUiOptions } from "./preset"
import { shortcuts } from "./preset/shortcuts"

export type SomeUiConfigOptions = PresetSomeUiOptions & {
  /**
   * Ship the component shortcut library (btn / card / input / badge …) in the
   * output regardless of whether the scanned content references each one.
   * Useful when the generated CSS is consumed as a shared stylesheet.
   *
   * @default false
   */
  includeShortcutLibrary?: boolean
}

/**
 * Build a UnoCSS config preconfigured with the some-ui preset and the
 * transformers we standardize on across the monorepo:
 *
 *  - `transformerDirectives`   → `@apply`, `@screen`, `theme()` in plain CSS,
 *    so an extension's existing vanilla `.css` can lean on tokens/utilities.
 *  - `transformerVariantGroup` → `hover:(bg-primary text-white)` grouping.
 *
 * Extensions extend this in their own `uno.config.ts` and run `@unocss/cli`
 * at build time to emit a static stylesheet.
 */
export function defineSomeUiConfig(
  options: SomeUiConfigOptions = {},
  userConfig: UserConfig = {}
): UserConfig {
  const { includeShortcutLibrary = false, preflight, dark } = options

  const {
    presets = [],
    transformers = [],
    safelist = [],
    ...restUserConfig
  } = userConfig

  return defineConfig({
    presets: [presetSomeUi({ preflight, dark }), ...presets],
    transformers: [
      transformerDirectives(),
      transformerVariantGroup(),
      ...transformers,
    ],
    safelist: [
      ...(includeShortcutLibrary ? Object.keys(shortcuts) : []),
      ...safelist,
    ],
    ...restUserConfig,
  })
}

export default defineSomeUiConfig
