export {
  ALL_THEME_CLASSES,
  APP_THEMES,
  APP_THEME_IDS,
  getAppTheme,
} from "./registry"

export type { AppTheme, AppThemeId, ThemeMode, ThemeSwatch } from "./registry"

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
