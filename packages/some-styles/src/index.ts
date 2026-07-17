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

export {
  ALL_THEME_CLASSES,
  APP_THEMES,
  APP_THEME_IDS,
  applyPreference,
  applyTheme,
  DEFAULT_PREFERENCE,
  getAppTheme,
  isThemePreference,
  prefersDark,
  readStoredPreference,
  resolveTheme,
  SYSTEM_PREFERENCE,
  THEME_STORAGE_KEY,
  watchSystem,
  writeStoredPreference,
  type AppTheme,
  type AppThemeId,
  type ThemeMode,
  type ThemePreference,
  type ThemeSwatch,
} from "./theme"
