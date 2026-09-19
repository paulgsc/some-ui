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
import { IntentButton, IntentFailure } from "@/lib/intent/render"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { TopikLevel, UserProfile } from "@/lib/tenant"
import { profileQuery, useProfile, useUpdateProfile } from "@/lib/tenant"

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
  const outcome = queryOutcome(useProfile())

  return matchQueryOutcome(outcome, {
    pending: () => <ProfileSkeleton />,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
    ready: (profile, refreshError) => (
      <div className="max-w-xl space-y-4">
        {/* A cached profile through a failed background refresh may be
            stale, so the refresh failure rides alongside the editable form
            instead of being silently discarded - a bot review caught the
            identical gap in `sessions/$sessionId.tsx`/`new.tsx` and this
            file shared it. */}
        {refreshError && (
          <IntentFailure
            error={refreshError.error}
            onRetry={refreshError.retry}
          />
        )}
        <ProfileForm profile={profile} />
      </div>
    ),
  })
}

export const Route = createFileRoute("/_dashboard/profile")({
  // See `sessions/$sessionId.tsx`'s loader for why this is a non-awaited
  // prefetch and not `ensureQueryData`: a head start, never a gate.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(profileQuery)
  },
  component: ProfileRoute,
})
