import type { JSX } from "react"
import { useState } from "react"
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
import { createFileRoute } from "@tanstack/react-router"
import { cn } from "some-ui-utils"
import { toast } from "sonner"

import { useIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import type { TopikLevel, UserProfile } from "@/lib/tenant"
import { useProfile, useUpdateProfile } from "@/lib/tenant"

const AVATAR_OPTIONS: ReadonlyArray<string> = [
  "🙂",
  "😎",
  "🦊",
  "🐨",
  "🐼",
  "🦁",
  "🐸",
  "🌸",
]

const TOPIK_LEVEL_OPTIONS: ReadonlyArray<{ value: TopikLevel; label: string }> =
  [
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
  ]

function isTopikLevel(value: string): value is TopikLevel {
  return TOPIK_LEVEL_OPTIONS.some((option) => option.value === value)
}

const ProfileSkeleton = (): JSX.Element => (
  <Card className="max-w-xl">
    <CardContent className="space-y-4 pt-6">
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
)

const ProfileForm = ({ profile }: { profile: UserProfile }): JSX.Element => {
  const [draft, setDraft] = useState<UserProfile>(profile)
  const saveIntent = useIntent(useUpdateProfile(), {
    presentation: "interactive",
  })

  const isDirty = JSON.stringify(profile) !== JSON.stringify(draft)

  // Lifted verbatim from the pre-migration `onSuccess`.
  useIntentEffect(saveIntent.state, () => {
    toast("Profile saved")
  })

  const handleSave = (): void => {
    saveIntent.start(draft)
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How you show up across your sessions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Avatar</Label>
          <div className="flex flex-wrap gap-2">
            {AVATAR_OPTIONS.map((avatar) => (
              <button
                key={avatar}
                type="button"
                onClick={() => setDraft({ ...draft, avatar })}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full border-2 text-xl transition-colors",
                  draft.avatar === avatar
                    ? "border-primary"
                    : "border-transparent hover:border-border"
                )}
              >
                {avatar}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={draft.displayName}
            onChange={(e) =>
              setDraft({ ...draft, displayName: e.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>TOPIK target level</Label>
          <Select
            value={draft.targetTopikLevel}
            onValueChange={(value: string) => {
              if (isTopikLevel(value))
                setDraft({ ...draft, targetTopikLevel: value })
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPIK_LEVEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

const ProfileRoute = (): JSX.Element => {
  const { data: profile, isLoading } = useProfile()

  if (isLoading || !profile) {
    return <ProfileSkeleton />
  }

  return <ProfileForm profile={profile} />
}

export const Route = createFileRoute("/_dashboard/profile")({
  component: ProfileRoute,
})
