import type { JSX } from "react"
import { useState } from "react"
import { Button } from "@some-ui/shared"
import type { SceneConfig } from "@some-ui/types"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "some-ui-utils"
import { toast } from "sonner"

import {
  defaultSessionName,
  getActivity,
  sequenceScenes,
  totalDurationOfScenes,
} from "@some-ui/activity-catalog"
import type { ActivityConfigValues, ActivityId } from "@some-ui/activity-catalog"
import {
  checkSessionDuration,
  describeDurationCheck,
} from "@/lib/session-duration-policy"
import type { SessionRecord } from "@/lib/tenant"
import { useCreateSession, useUpdateSession } from "@/lib/tenant"

import { ActivityPickerStep } from "./activity-picker-step"
import { ArrangementStep } from "./arrangement-step"
import { ConfigureStep } from "./configure-step"
import { ReviewStep } from "./review-step"
import { buildSessionActivities } from "./utils"

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

type ComposerActivity = {
  /**
   * Composer-local identity distinguishing repeated instances of the same
   * activity within one session (e.g. two Honeycomb blocks with different
   * modes) - never persisted. `SessionActivity` has no equivalent field;
   * array position is authoritative there (see composer/utils.ts).
   */
  instanceId: string
  activityId: ActivityId
  config: ActivityConfigValues
}

export const SessionComposer = ({
  initialActivity,
  existingSession,
}: SessionComposerProps): JSX.Element => {
  const navigate = useNavigate()
  const createSession = useCreateSession()
  const updateSession = useUpdateSession()

  const [step, setStep] = useState<ComposerStep>(1)
  const [items, setItems] = useState<Array<ComposerActivity>>(() =>
    existingSession
      ? existingSession.activities.map((activity) => ({
          instanceId: crypto.randomUUID(),
          activityId: activity.activityId,
          config: activity.config,
        }))
      : initialActivity
        ? [
            {
              instanceId: crypto.randomUUID(),
              activityId: initialActivity,
              config: getActivity(initialActivity).defaultConfig,
            },
          ]
        : []
  )
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

  const selectedIds = items.map((item) => item.activityId)
  const activities = buildSessionActivities(items)
  const basicScenes = sequenceScenes(activities)
  const scenes =
    arrangementMode === "advanced"
      ? (advancedScenes ?? basicScenes)
      : basicScenes

  // Checked against the actual scenes, not the friendly per-activity form
  // fields, so a manual Advanced-arrangement edit is caught the same way a
  // Configure-step value would be (see session-duration-policy).
  const durationCheck = checkSessionDuration(scenes)
  const durationWarning = describeDurationCheck(durationCheck)

  const handleAddActivity = (id: ActivityId): void => {
    // Once the session is already over the duration cap, adding yet another
    // activity can't make it valid again - a no-op (with an explanation)
    // beats silently growing an already-invalid session further.
    if (durationCheck.state === "too-long") {
      toast.error(
        "Session duration cap reached - remove or shorten an activity before adding another."
      )
      return
    }

    setItems((current) => [
      ...current,
      {
        instanceId: crypto.randomUUID(),
        activityId: id,
        config: getActivity(id).defaultConfig,
      },
    ])
  }

  const handleRemoveActivity = (instanceId: string): void => {
    setItems((current) =>
      current.filter((item) => item.instanceId !== instanceId)
    )
  }

  const handleFieldChange = (
    instanceId: string,
    key: string,
    value: string | number
  ): void => {
    setItems((current) =>
      current.map((item) =>
        item.instanceId === instanceId
          ? { ...item, config: { ...item.config, [key]: value } }
          : item
      )
    )
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
            toast("Draft updated")
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
          toast("Session saved as draft")
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
          items={items}
          onAdd={handleAddActivity}
          onRemove={handleRemoveActivity}
        />
      )}
      {step === 2 && (
        <ConfigureStep items={items} onFieldChange={handleFieldChange} />
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
          items={items}
          scenes={scenes}
          mode={arrangementMode}
          sessionName={sessionName}
          onSessionNameChange={setSessionName}
          defaultName={defaultSessionName(selectedIds)}
        />
      )}

      {durationWarning && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {durationWarning}
        </div>
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
              disabled={isSaving || durationCheck.state !== "valid"}
            >
              Save as draft
            </Button>
            <Button
              onClick={handleSaveAndPlay}
              disabled={isSaving || durationCheck.state !== "valid"}
            >
              Save &amp; Play
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
