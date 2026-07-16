/**
 * Framework-agnostic theme controller: resolve a stored preference, apply the
 * matching root classes, persist changes, and track the OS light/dark setting.
 * No React, no DOM assumptions beyond an `Element` you hand it — the www app
 * wraps this in a thin React context, but a plain script (or a pre-paint inline
 * snippet) can drive it just as well.
 *
 * The pre-paint no-flash script in `apps/www/index.html` mirrors the small
 * subset here (storage key + class mapping); keep them in sync.
 */

import {
  ALL_THEME_CLASSES,
  APP_THEMES,
  getAppTheme,
  type AppTheme,
  type AppThemeId,
} from "./registry"

export const THEME_STORAGE_KEY = "some-ui.theme"

/** "system" follows the OS setting; any other value is an {@link AppThemeId}. */
export const SYSTEM_PREFERENCE = "system"
export type ThemePreference = AppThemeId | typeof SYSTEM_PREFERENCE

/** The theme "system" resolves to for each OS mode. */
const SYSTEM_LIGHT: AppThemeId = "light"
const SYSTEM_DARK: AppThemeId = "dark"

export const DEFAULT_PREFERENCE: ThemePreference = SYSTEM_PREFERENCE

type StorageLike = Pick<Storage, "getItem" | "setItem">

function safeStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null
    return window.localStorage
  } catch {
    // Access can throw in sandboxed/privacy contexts.
    return null
  }
}

export function isThemePreference(value: string): value is ThemePreference {
  return value === SYSTEM_PREFERENCE || APP_THEMES.some((t) => t.id === value)
}

/** True when the OS currently prefers a dark color scheme. */
export function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
}

/** Resolve a preference to a concrete theme, expanding "system". */
export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean = prefersDark()
): AppTheme {
  if (preference === SYSTEM_PREFERENCE) {
    const id = systemDark ? SYSTEM_DARK : SYSTEM_LIGHT
    return getAppTheme(id) ?? APP_THEMES[0]
  }
  return getAppTheme(preference) ?? APP_THEMES[0]
}

export function readStoredPreference(
  storage: StorageLike | null = safeStorage()
): ThemePreference | null {
  const raw = storage?.getItem(THEME_STORAGE_KEY)
  return raw && isThemePreference(raw) ? raw : null
}

export function writeStoredPreference(
  preference: ThemePreference,
  storage: StorageLike | null = safeStorage()
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Non-fatal: persistence is best-effort.
  }
}

/**
 * Apply a resolved theme to a root element: swap the theme classes and set
 * `color-scheme` / `data-theme` so native UI (scrollbars, form controls) and
 * CSS hooks stay in sync. Idempotent — safe to call on every change.
 */
export function applyTheme(root: HTMLElement, theme: AppTheme): void {
  root.classList.remove(...ALL_THEME_CLASSES)
  if (theme.classNames.length > 0) {
    root.classList.add(...theme.classNames)
  }
  root.dataset.theme = theme.id
  root.style.colorScheme = theme.mode
}

/** Resolve + apply in one call; returns the concrete theme that was applied. */
export function applyPreference(
  root: HTMLElement,
  preference: ThemePreference,
  systemDark: boolean = prefersDark()
): AppTheme {
  const theme = resolveTheme(preference, systemDark)
  applyTheme(root, theme)
  return theme
}

/**
 * Subscribe to OS light/dark changes. Returns an unsubscribe function. No-op
 * (returns a noop) where `matchMedia` is unavailable.
 */
export function watchSystem(
  onChange: (systemDark: boolean) => void
): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {}
  }
  const query = window.matchMedia("(prefers-color-scheme: dark)")
  const handler = (event: MediaQueryListEvent): void => onChange(event.matches)
  query.addEventListener("change", handler)
  return () => query.removeEventListener("change", handler)
}
