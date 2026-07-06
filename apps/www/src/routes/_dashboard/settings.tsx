import type { JSX } from "react"
import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  Button,
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
  useToast,
} from "some-ui-shared"
import { BUILTIN_VOICES } from "some-ui-utils"
import type { TTSProvider } from "some-ui-utils"

import type { LayoutTreeId } from "@/lib/activity-catalog"
import type { ThemePreference, UserSettings } from "@/lib/tenant"
import { useSettings, useUpdateSettings } from "@/lib/tenant"

const TTS_PROVIDER_OPTIONS: ReadonlyArray<{
  value: TTSProvider
  label: string
}> = [
  { value: "openai", label: "OpenAI" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "google", label: "Google" },
  { value: "azure", label: "Azure" },
  { value: "custom", label: "Custom" },
]

const LAYOUT_TREE_OPTIONS: ReadonlyArray<{
  value: LayoutTreeId
  label: string
}> = [
  { value: "study", label: "Study" },
  { value: "topik", label: "TOPIK sidebar" },
  { value: "drama", label: "Drama" },
  { value: "voice", label: "Voice" },
]

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> =
  [
    { value: "system", label: "Match system" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ]

function isTTSProvider(value: string): value is TTSProvider {
  return TTS_PROVIDER_OPTIONS.some((option) => option.value === value)
}

function isLayoutTreeId(value: string): value is LayoutTreeId {
  return LAYOUT_TREE_OPTIONS.some((option) => option.value === value)
}

function isThemePreference(value: string): value is ThemePreference {
  return THEME_OPTIONS.some((option) => option.value === value)
}

const SettingsSkeleton = (): JSX.Element => (
  <Card className="max-w-xl">
    <CardContent className="space-y-4 pt-6">
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
  const [draft, setDraft] = useState<UserSettings>(settings)
  const updateSettings = useUpdateSettings()
  const { toast } = useToast()

  const isDirty = JSON.stringify(settings) !== JSON.stringify(draft)
  const voicesForProvider = BUILTIN_VOICES[draft.ttsProvider]

  const handleProviderChange = (provider: TTSProvider): void => {
    // A voice id from the old provider won't exist on the new one.
    setDraft({ ...draft, ttsProvider: provider, ttsVoiceId: "" })
  }

  const handleSave = (): void => {
    updateSettings.mutate(draft, {
      onSuccess: () => {
        toast({ title: "Settings saved" })
      },
    })
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
        <div className="space-y-2">
          <Label>Text-to-speech provider</Label>
          <Select
            value={draft.ttsProvider}
            onValueChange={(value: string) => {
              if (isTTSProvider(value)) handleProviderChange(value)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTS_PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Voice</Label>
          {voicesForProvider.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No preset voices for this provider. Uses the endpoint default
              voice.
            </p>
          ) : (
            <Select
              value={draft.ttsVoiceId || voicesForProvider[0]?.id}
              onValueChange={(value: string) =>
                setDraft({ ...draft, ttsVoiceId: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voicesForProvider.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

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
            value={draft.theme}
            onValueChange={(value: string) => {
              if (isThemePreference(value)) setDraft({ ...draft, theme: value })
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

        <Button
          onClick={handleSave}
          disabled={!isDirty || updateSettings.isPending}
        >
          {updateSettings.isPending ? "Saving..." : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  )
}

const SettingsRoute = (): JSX.Element => {
  const { data: settings, isLoading } = useSettings()

  if (isLoading || !settings) {
    return <SettingsSkeleton />
  }

  return <SettingsForm settings={settings} />
}

export const Route = createFileRoute("/_dashboard/settings")({
  component: SettingsRoute,
})
