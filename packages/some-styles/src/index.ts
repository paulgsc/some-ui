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
  ACCENT_THEMES,
  ALL_THEME_CLASSES,
  appearanceClassName,
  appearanceProps,
  applyAppearance,
  applyPreference,
  applyTheme,
  BOUNDARY_OVERRIDE_CLASSES,
  COMPONENT_SKINS,
  DEFAULT_PREFERENCE,
  FEATURE_APPEARANCE_IDS,
  FEATURE_APPEARANCES,
  getComponentSkin,
  getFeatureAppearance,
  getSessionTheme,
  getTheme,
  isThemePreference,
  prefersDark,
  readStoredPreference,
  resolveTheme,
  SESSION_THEME_CLASSES,
  SESSION_THEME_IDS,
  SESSION_THEMES,
  SYSTEM_PREFERENCE,
  THEME_STORAGE_KEY,
  THEMES,
  watchSystem,
  writeStoredPreference,
  type Appearance,
  type BoundaryProps,
  type FeatureAppearanceId,
  type SessionTheme,
  type SessionThemeId,
  type ThemeBoundary,
  type ThemeDefinition,
  type ThemeMode,
  type ThemePreference,
  type ThemeScope,
  type ThemeSwatch,
} from "./theme"
