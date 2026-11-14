import type { JSX } from "react"
import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@some-ui/shared"
import { toast } from "sonner"

import { useIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton, IntentFailure } from "@/lib/intent/render"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { UserSettings } from "@/lib/tenant"
import { useSettings, useUpdateSettings } from "@/lib/tenant"
import { DeviceVoiceField } from "@/components/settings/device-voice-field"
import { StudyNudgeSection } from "@/components/settings/study-nudge-section"

/**
 * The fields this form edits; the rest of the record is the header's audio
 * menu's (`lib/audio-preferences`).
 */
type StudyFields = Pick<UserSettings, "deviceVoiceId" | "notifications">

function studyFields(settings: UserSettings): StudyFields {
  return {
    deviceVoiceId: settings.deviceVoiceId,
    notifications: settings.notifications,
  }
}

const StudySettingsSkeleton = (): JSX.Element => (
  <Card className="max-w-xl">
    <CardContent className="space-y-4 pt-[var(--card-p,1.5rem)]">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
)

const StudySettingsForm = ({
  settings,
}: {
  settings: UserSettings
}): JSX.Element => {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- an edit buffer: a refetch must not overwrite unsaved choices, and isDirty compares it against the live settings
  const [draft, setDraft] = useState<StudyFields>(() => studyFields(settings))
  const saveIntent = useIntent(useUpdateSettings(), {
    presentation: "interactive",
  })

  const isDirty =
    JSON.stringify(studyFields(settings)) !== JSON.stringify(draft)

  // One save intent and no navigation, so no `activeAction`-style gating.
  useIntentEffect(saveIntent, () => {
    toast("Settings saved")
  })

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          {import.meta.env.VITE_DEVICE_BACKEND === "true"
            ? "The voice lessons speak in, and when to be reminded."
            : "When to be reminded. Lessons are read aloud in your browser's own voice."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Only the phone's engine has voices to pick from (#1628). */}
        {import.meta.env.VITE_DEVICE_BACKEND === "true" && (
          <DeviceVoiceField
            value={draft.deviceVoiceId}
            onChange={(deviceVoiceId) => setDraft({ ...draft, deviceVoiceId })}
          />
        )}

        <StudyNudgeSection
          preferences={draft.notifications}
          onChange={(notifications) => setDraft({ ...draft, notifications })}
        />

        <IntentButton
          state={saveIntent.state}
          // Over the live record, so what this form does not edit stays as
          // it is now, not as it was when the form opened.
          onPress={() => saveIntent.start({ ...settings, ...draft })}
          disabled={!isDirty}
          idleLabel="Save changes"
          workingLabel="Saving..."
        />
      </CardContent>
    </Card>
  )
}

/**
 * Practice's settings (lib/wings): the voice and the study reminders, at
 * `/practice/settings` on both surfaces.
 */
export const StudySettings = (): JSX.Element => {
  const outcome = queryOutcome(useSettings())

  return matchQueryOutcome(outcome, {
    pending: () => <StudySettingsSkeleton />,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
    ready: (settings, refreshError) => (
      <div className="max-w-xl space-y-4">
        {/* A cached record through a failed refresh may be stale, so the
            failure rides alongside the form (as in `profile.tsx`). */}
        {refreshError && (
          <IntentFailure
            error={refreshError.error}
            onRetry={refreshError.retry}
          />
        )}
        <StudySettingsForm settings={settings} />
      </div>
    ),
  })
}
