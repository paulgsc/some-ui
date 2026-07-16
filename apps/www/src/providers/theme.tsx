import type { JSX, ReactNode } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import {
  applyPreference,
  DEFAULT_PREFERENCE,
  prefersDark,
  readStoredPreference,
  resolveTheme,
  SYSTEM_PREFERENCE,
  watchSystem,
  writeStoredPreference,
  type AppTheme,
  type ThemePreference,
} from "@some-ui/styles/theme"

type ThemeContextValue = {
  /** The user's stored choice ("system" or a concrete theme id). */
  preference: ThemePreference
  /** The theme actually applied right now (system resolved to light/dark). */
  resolved: AppTheme
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function initialPreference(): ThemePreference {
  return readStoredPreference() ?? DEFAULT_PREFERENCE
}

/**
 * Applies the theme to `<html>` and keeps it in sync with the stored
 * preference and (when set to "system") the OS setting. The pre-paint script
 * in index.html has already applied the correct classes, so the first render
 * matches — this provider just takes over reactivity from there.
 */
export const ThemeProvider = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(initialPreference)
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark)

  // Apply whenever the preference or (for "system") the OS setting changes.
  useEffect(() => {
    applyPreference(document.documentElement, preference, systemDark)
  }, [preference, systemDark])

  // Only track the OS setting while the user is on "system".
  useEffect(() => {
    if (preference !== SYSTEM_PREFERENCE) return
    return watchSystem(setSystemDark)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference): void => {
    writeStoredPreference(next)
    setPreferenceState(next)
  }, [])

  const resolved = resolveTheme(preference, systemDark)

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
