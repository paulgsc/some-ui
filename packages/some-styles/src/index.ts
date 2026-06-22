/**
 * `@some-ui/styles` — shared design system for the some-ui monorepo.
 *
 * Dev-time ergonomics (UnoCSS utilities + shadcn shortcuts), runtime output
 * of plain static CSS. Import the JS API here to build configs and theme
 * switchers; import the CSS entrypoints (`./tokens.css`, `./themes.css`,
 * `./tailwind.css`) for the actual styles.
 */

export { defineSomeUiConfig, type SomeUiConfigOptions } from "./config"

export {
  presetSomeUi,
  type PresetSomeUiOptions,
  colors,
  fontFamily,
  radius,
  someUiTheme,
} from "./preset"

export {
  appThemes,
  colorThemes,
  themeIds,
  themes,
  type ThemeKind,
  type ThemeMeta,
} from "./preset/themes"
