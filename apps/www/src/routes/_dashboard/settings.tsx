import type { JSX } from "react"
import { useTheme } from "@/providers/theme"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { createFileRoute } from "@tanstack/react-router"

import { MOBILE_APP } from "@/lib/build-profile"
import { DataHomeSection } from "@/components/settings/data-home-section"
import { DeviceSection } from "@/components/settings/device-section"

/** "System" plus every selectable palette from the shared design system. */
const THEME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: SYSTEM_PREFERENCE, label: "Match system" },
  ...SESSION_THEMES.map((theme) => ({ value: theme.id, label: theme.label })),
]

/** Applies live and persists on its own (`providers/theme`): no Save. */
const ThemeCard = (): JSX.Element => {
  const { preference, setPreference } = useTheme()
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
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
      </CardContent>
    </Card>
  )
}

/**
 * Outside the settings outcome: signing out must work when settings don't
 * load. On the Android app there is no account to sign out of; the card
 * holds the phone's own controls instead (the sync from home).
 */
const AccountCard = (): JSX.Element => (
  <Card className="max-w-xl">
    <CardContent className="pt-[var(--card-p,1.5rem)]">
      {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
        <DeviceSection />
      ) : (
        <DataHomeSection />
      )}
    </CardContent>
  </Card>
)

/**
 * The front desk (lib/wings): what belongs to no wing. The theme, and the
 * account on the web or this phone's own controls on the Android app. The
 * study settings are Practice's own (`/practice/settings`) on both.
 */
const SettingsRoute = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    {!MOBILE_APP && (
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Front desk</h1>
        <p className="text-muted-foreground text-sm">
          What belongs to no wing: the theme and the account. Study settings are
          in Practice.
        </p>
      </div>
    )}
    <ThemeCard />
    <AccountCard />
  </div>
)

export const Route = createFileRoute("/_dashboard/settings")({
  component: SettingsRoute,
})
