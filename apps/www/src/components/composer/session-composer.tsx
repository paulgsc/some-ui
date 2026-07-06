import type { JSX } from "react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { SceneConfig } from "some-types-utils"
import { Button, useToast } from "some-ui-shared"
import { cn } from "some-ui-utils"

import { getActivity, sequenceScenes } from "@/lib/activity-catalog"
import type { ActivityConfigValues, ActivityId } from "@/lib/activity-catalog"
import type { SessionRecord } from "@/lib/tenant"
import { useCreateSession, useUpdateSession } from "@/lib/tenant"

import { ActivityPickerStep } from "./activity-picker-step"
import { ArrangementStep } from "./arrangement-step"
import { ConfigureStep } from "./configure-step"
import { ReviewStep } from "./review-step"
import {
  buildSessionActivities,
  defaultSessionName,
  totalDurationOfScenes,
} from "./utils"

type ArrangementMode = "basic" | "advanced"
type ComposerStep = 1 | 2 | 3 | 4

const STEP_ORDER: ReadonlyArray<ComposerStep> = [1, 2, 3, 4]

const STEP_LABELS: Record<ComposerStep, string> = {
  1: "Choose activities",
  2: "Configure",
  3: "Arrange",
  4: "Review",
}

type SessionComposerProps = {
  initialActivity?: ActivityId
  /** When set, the composer edits this draft in place instead of creating a new session. */
  existingSession?: SessionRecord
}

export const SessionComposer = ({
  initialActivity,
  existingSession,
}: SessionComposerProps): JSX.Element => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const createSession = useCreateSession()
  const updateSession = useUpdateSession()

  const [step, setStep] = useState<ComposerStep>(1)
  const [selectedIds, setSelectedIds] = useState<Array<ActivityId>>(() =>
    existingSession
      ? existingSession.activities.map((activity) => activity.activityId)
      : initialActivity
        ? [initialActivity]
        : []
  )
  const [configs, setConfigs] = useState<
    Partial<Record<ActivityId, ActivityConfigValues>>
  >(() => {
    if (!existingSession) return {}
    const seeded: Partial<Record<ActivityId, ActivityConfigValues>> = {}
    for (const activity of existingSession.activities) {
      seeded[activity.activityId] = activity.config
    }
    return seeded
  })
  const [arrangementMode, setArrangementMode] = useState<ArrangementMode>(
    () => existingSession?.layoutMode ?? "basic"
  )
  const [advancedScenes, setAdvancedScenes] =
    useState<Array<SceneConfig> | null>(() =>
      existingSession?.layoutMode === "advanced" ? existingSession.scenes : null
    )
  const [sessionName, setSessionName] = useState(
    () => existingSession?.name ?? ""
  )

  const activities = buildSessionActivities(selectedIds, configs)
  const basicScenes = sequenceScenes(activities)
  const scenes =
    arrangementMode === "advanced"
      ? (advancedScenes ?? basicScenes)
      : basicScenes

  const handleToggleActivity = (id: ActivityId): void => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id]
    )
  }

  const handleFieldChange = (
    activityId: ActivityId,
    key: string,
    value: string | number
  ): void => {
    setConfigs((current) => ({
      ...current,
      [activityId]: {
        ...(current[activityId] ?? getActivity(activityId).defaultConfig),
        [key]: value,
      },
    }))
  }

  const handleEnableAdvanced = (): void => {
    setAdvancedScenes((current) => current ?? basicScenes)
    setArrangementMode("advanced")
  }

  const handleDisableAdvanced = (): void => {
    setArrangementMode("basic")
    setAdvancedScenes(null)
  }

  const handleNext = (): void => {
    setStep((current) => {
      const index = STEP_ORDER.indexOf(current)
      return STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)] ?? current
    })
  }

  const handleBack = (): void => {
    setStep((current) => {
      const index = STEP_ORDER.indexOf(current)
      return STEP_ORDER[Math.max(index - 1, 0)] ?? current
    })
  }

  const finalName = sessionName.trim() || defaultSessionName(selectedIds)

  const handleSaveDraft = (): void => {
    if (existingSession) {
      updateSession.mutate(
        {
          id: existingSession.id,
          patch: {
            name: finalName,
            activities,
            scenes,
            layoutMode: arrangementMode,
            totalDurationMs: totalDurationOfScenes(scenes),
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Draft updated" })
            void navigate({ to: "/sessions" })
          },
        }
      )
      return
    }

    createSession.mutate(
      { name: finalName, activities, scenes, layoutMode: arrangementMode },
      {
        onSuccess: () => {
          toast({ title: "Session saved as draft" })
          void navigate({ to: "/sessions" })
        },
      }
    )
  }

  const handleSaveAndPlay = (): void => {
    if (existingSession) {
      updateSession.mutate(
        {
          id: existingSession.id,
          patch: {
            name: finalName,
            activities,
            scenes,
            layoutMode: arrangementMode,
            totalDurationMs: totalDurationOfScenes(scenes),
            status: "active",
            startedAt: new Date().toISOString(),
          },
        },
        {
          onSuccess: (session) => {
            void navigate({
              to: "/sessions/$sessionId",
              params: { sessionId: session.id },
            })
          },
        }
      )
      return
    }

    createSession.mutate(
      { name: finalName, activities, scenes, layoutMode: arrangementMode },
      {
        onSuccess: (session) => {
          updateSession.mutate(
            {
              id: session.id,
              patch: { status: "active", startedAt: new Date().toISOString() },
            },
            {
              onSuccess: () => {
                void navigate({
                  to: "/sessions/$sessionId",
                  params: { sessionId: session.id },
                })
              },
            }
          )
        },
      }
    )
  }

  const canProceedFromStep1 = selectedIds.length > 0
  const isSaving = createSession.isPending || updateSession.isPending

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        {STEP_ORDER.map((s) => (
          <div
            key={s}
            className="flex flex-1 items-center gap-2 last:flex-none"
          >
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                s === step
                  ? "bg-primary text-primary-foreground"
                  : s < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {s}
            </div>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                s === step ? "font-medium" : "text-muted-foreground"
              )}
            >
              {STEP_LABELS[s]}
            </span>
            {s !== 4 && <div className="bg-border h-px flex-1" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <ActivityPickerStep
          selectedIds={selectedIds}
          onToggle={handleToggleActivity}
        />
      )}
      {step === 2 && (
        <ConfigureStep
          selectedIds={selectedIds}
          configs={configs}
          onFieldChange={handleFieldChange}
        />
      )}
      {step === 3 && (
        <ArrangementStep
          basicScenes={basicScenes}
          mode={arrangementMode}
          advancedScenes={advancedScenes}
          onEnableAdvanced={handleEnableAdvanced}
          onDisableAdvanced={handleDisableAdvanced}
          onScenesChange={setAdvancedScenes}
        />
      )}
      {step === 4 && (
        <ReviewStep
          selectedIds={selectedIds}
          configs={configs}
          scenes={scenes}
          mode={arrangementMode}
          sessionName={sessionName}
          onSessionNameChange={setSessionName}
          defaultName={defaultSessionName(selectedIds)}
        />
      )}

      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={handleBack} disabled={step === 1}>
          Back
        </Button>
        {step < 4 ? (
          <Button
            onClick={handleNext}
            disabled={step === 1 && !canProceedFromStep1}
          >
            Continue
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSaving}
            >
              Save as draft
            </Button>
            <Button onClick={handleSaveAndPlay} disabled={isSaving}>
              Save &amp; Play
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
