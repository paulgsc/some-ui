/**
 * Framework-agnostic theme controller: resolve a stored preference, apply the
 * matching root classes, persist changes, and track the OS light/dark setting.
 * No React, no DOM assumptions beyond an `Element` you hand it — the www app
 * wraps this in a thin React context, but a plain script (or a pre-paint inline
 * snippet) can drive it just as well.
 *
 * The pre-paint no-flash scripts in `apps/www/index.html` and
 * `apps/www/resume/index.html` mirror the small subset here (storage key,
 * class mapping, retired ids); www's theme contract test keeps them in sync.
 */

import type { SessionTheme, SessionThemeId } from "./registry"
import {
  getSessionTheme,
  SESSION_THEME_CLASSES,
  SESSION_THEMES,
} from "./registry"

export const THEME_STORAGE_KEY = "some-ui.theme"

/** "system" follows the OS setting; any other value is a {@link SessionThemeId}. */
export const SYSTEM_PREFERENCE = "system"
export type ThemePreference = SessionThemeId | typeof SYSTEM_PREFERENCE

/** The theme "system" resolves to for each OS mode. */
const SYSTEM_LIGHT: SessionThemeId = "light"
const SYSTEM_DARK: SessionThemeId = "dark"

/**
 * What a fresh install opens in: the brand's own theme, not the OS setting.
 * `light` and `dark` stay one tap away for anyone who wants the plain look.
 */
export const DEFAULT_PREFERENCE: ThemePreference = "mochi"

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

/**
 * Session themes that were removed, mapped to the theme that replaced them, so
 * someone who picked one opens to its successor instead of silently falling
 * back to the default. Reading a retired id also writes its successor back, so
 * an entry can be deleted once the people who stored it have opened the app
 * since: a few releases after the removal is plenty. The pre-paint scripts
 * mirror this map.
 */
export const RETIRED_THEMES: Readonly<Record<string, SessionThemeId>> = {
  "strawberry-moon": "rose-night",
  "peachy-blossom": "mochi",
}

export function isThemePreference(value: string): value is ThemePreference {
  return (
    value === SYSTEM_PREFERENCE || SESSION_THEMES.some((t) => t.id === value)
  )
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
): SessionTheme {
  if (preference === SYSTEM_PREFERENCE) {
    const id = systemDark ? SYSTEM_DARK : SYSTEM_LIGHT
    return getSessionTheme(id) ?? SESSION_THEMES[0]
  }
  return getSessionTheme(preference) ?? SESSION_THEMES[0]
}

/** The successor of a retired theme id, or undefined for any other value. */
function successorOf(id: string): SessionThemeId | undefined {
  return Object.hasOwn(RETIRED_THEMES, id) ? RETIRED_THEMES[id] : undefined
}

export function readStoredPreference(
  storage: StorageLike | null = safeStorage()
): ThemePreference | null {
  const stored = storage?.getItem(THEME_STORAGE_KEY)
  if (!stored) return null
  const successor = successorOf(stored)
  if (successor) {
    writeStoredPreference(successor, storage)
    return successor
  }
  return isThemePreference(stored) ? stored : null
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
export function applyTheme(root: HTMLElement, theme: SessionTheme): void {
  root.classList.remove(...SESSION_THEME_CLASSES)
  if (theme.boundary.classNames.length > 0) {
    root.classList.add(...theme.boundary.classNames)
  }
  root.dataset.theme = theme.boundary.dataTheme
  root.style.colorScheme = theme.mode
}

/** Resolve + apply in one call; returns the concrete theme that was applied. */
export function applyPreference(
  root: HTMLElement,
  preference: ThemePreference,
  systemDark: boolean = prefersDark()
): SessionTheme {
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
