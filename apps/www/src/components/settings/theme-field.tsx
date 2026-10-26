import type { JSX } from "react"
import { useTheme } from "@/providers/theme"
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@some-ui/shared"
import {
  isThemePreference,
  SESSION_THEMES,
  SYSTEM_PREFERENCE,
} from "@some-ui/styles/theme"

/** "System" plus every selectable palette from the shared design system. */
const THEME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: SYSTEM_PREFERENCE, label: "Match system" },
  ...SESSION_THEMES.map((theme) => ({ value: theme.id, label: theme.label })),
]

/** Applies live and persists on its own (`providers/theme`): no Save. */
export const ThemeField = (): JSX.Element => {
  const { preference, setPreference } = useTheme()
  return (
    <div className="space-y-2">
      <Label htmlFor="theme">Theme</Label>
      <Select
        value={preference}
        onValueChange={(value: string) => {
          if (isThemePreference(value)) setPreference(value)
        }}
      >
        <SelectTrigger id="theme">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
