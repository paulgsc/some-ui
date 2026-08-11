export {
  ACCENT_THEMES,
  ALL_THEME_CLASSES,
  BOUNDARY_OVERRIDE_CLASSES,
  COMPONENT_SKINS,
  FEATURE_APPEARANCE_IDS,
  FEATURE_APPEARANCES,
  getComponentSkin,
  getFeatureAppearance,
  getSessionTheme,
  getTheme,
  SESSION_THEME_CLASSES,
  SESSION_THEME_IDS,
  SESSION_THEMES,
  THEMES,
} from "./registry"

export type {
  FeatureAppearanceId,
  SessionTheme,
  SessionThemeId,
  ThemeBoundary,
  ThemeDefinition,
  ThemeMode,
  ThemeScope,
  ThemeSwatch,
} from "./registry"

export type { Appearance, BoundaryProps } from "./boundary"

export {
  appearanceClassName,
  appearanceProps,
  applyAppearance,
} from "./boundary"

export type { ThemePreference } from "./controller"

export {
  applyPreference,
  applyTheme,
  DEFAULT_PREFERENCE,
  isThemePreference,
  prefersDark,
  readStoredPreference,
  resolveTheme,
  SYSTEM_PREFERENCE,
  THEME_STORAGE_KEY,
  watchSystem,
  writeStoredPreference,
} from "./controller"
