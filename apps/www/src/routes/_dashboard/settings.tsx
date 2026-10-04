import type { JSX } from "react"
import { useState } from "react"
import { useTheme } from "@/providers/theme"
import type { LayoutTreeId } from "@some-ui/activity-catalog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@some-ui/shared"
import {
  isThemePreference,
  SESSION_THEMES,
  SYSTEM_PREFERENCE,
} from "@some-ui/styles/theme"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { DEVICE_BACKEND } from "@/lib/data-mode"
import { useIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton, IntentFailure } from "@/lib/intent/render"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { UserSettings } from "@/lib/tenant"
import { settingsQuery, useSettings, useUpdateSettings } from "@/lib/tenant"
import { DataHomeSection } from "@/components/settings/data-home-section"
import { DeviceSection } from "@/components/settings/device-section"
import { HostedVoiceFields } from "@/components/settings/hosted-voice-fields"
import { StudyNudgeSection } from "@/components/settings/study-nudge-section"

const LAYOUT_TREE_OPTIONS: ReadonlyArray<{
  value: LayoutTreeId
  label: string
}> = [
  { value: "study", label: "Study" },
  { value: "topik", label: "TOPIK sidebar" },
  { value: "drama", label: "Drama" },
  { value: "voice", label: "Voice" },
]

/** "System" plus every selectable palette from the shared design system. */
const THEME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: SYSTEM_PREFERENCE, label: "Match system" },
  ...SESSION_THEMES.map((theme) => ({ value: theme.id, label: theme.label })),
]

function isLayoutTreeId(value: string): value is LayoutTreeId {
  return LAYOUT_TREE_OPTIONS.some((option) => option.value === value)
}

const SettingsSkeleton = (): JSX.Element => (
  <Card className="max-w-xl">
    <CardContent className="space-y-4 pt-[var(--card-p,1.5rem)]">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
)

const SettingsForm = ({
  settings,
}: {
  settings: UserSettings
}): JSX.Element => {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- an edit buffer: a refetch must not overwrite unsaved choices, and isDirty compares it against the live settings
  const [draft, setDraft] = useState<UserSettings>(settings)
  const saveIntent = useIntent(useUpdateSettings(), {
    presentation: "interactive",
  })
  const { preference, setPreference } = useTheme()

  const isDirty = JSON.stringify(settings) !== JSON.stringify(draft)

  // Lifted verbatim from the pre-migration `onSuccess`. No navigation, so
  // no `disabled` check is needed here the way session-composer's chain
  // needs `activeAction` - this form only ever has the one save intent.
  useIntentEffect(saveIntent.state, () => {
    toast("Settings saved")
  })

  const handleSave = (): void => {
    saveIntent.start(draft)
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          Defaults applied across your sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <HostedVoiceFields
          value={draft.ttsVoice}
          onChange={(ttsVoice) => setDraft({ ...draft, ttsVoice })}
        />

        <div className="space-y-2">
          <Label htmlFor="default-duration">
            Default session length (minutes)
          </Label>
          <Input
            id="default-duration"
            type="number"
            min={5}
            max={60}
            step={5}
            value={draft.defaultSessionDurationMinutes}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10)
              if (!Number.isNaN(value) && value > 0) {
                setDraft({ ...draft, defaultSessionDurationMinutes: value })
              }
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>Default layout</Label>
          <Select
            value={draft.defaultLayoutTree}
            onValueChange={(value: string) => {
              if (isLayoutTreeId(value))
                setDraft({ ...draft, defaultLayoutTree: value })
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_TREE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Theme</Label>
          <Select
            value={preference}
            onValueChange={(value: string) => {
              // Themes apply live and persist independently of the settings
              // form, so no Save is needed for this control.
              if (isThemePreference(value)) setPreference(value)
            }}
          >
            <SelectTrigger>
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

        <StudyNudgeSection
          preferences={draft.notifications}
          onChange={(notifications) => setDraft({ ...draft, notifications })}
        />

        <IntentButton
          state={saveIntent.state}
          onPress={handleSave}
          disabled={!isDirty}
          idleLabel="Save changes"
          workingLabel="Saving..."
        />
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
      {DEVICE_BACKEND ? <DeviceSection /> : <DataHomeSection />}
    </CardContent>
  </Card>
)

const SettingsOutcome = (): JSX.Element => {
  const outcome = queryOutcome(useSettings())

  return matchQueryOutcome(outcome, {
    pending: () => <SettingsSkeleton />,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
    ready: (settings, refreshError) => (
      <div className="max-w-xl space-y-4">
        {/* Same Safety invariant as `profile.tsx`'s identical fix: a cached
            settings record through a failed background refresh may be
            stale, so the refresh failure rides alongside the editable form
            instead of being silently discarded. */}
        {refreshError && (
          <IntentFailure
            error={refreshError.error}
            onRetry={refreshError.retry}
          />
        )}
        <SettingsForm settings={settings} />
      </div>
    ),
  })
}

const SettingsRoute = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    <SettingsOutcome />
    <AccountCard />
  </div>
)

export const Route = createFileRoute("/_dashboard/settings")({
  // See `sessions/$sessionId.tsx`'s loader for why this is a non-awaited
  // prefetch and not `ensureQueryData`: a head start, never a gate.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(settingsQuery)
  },
  component: SettingsRoute,
})
