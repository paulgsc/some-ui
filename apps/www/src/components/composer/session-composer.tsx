import type { JSX } from "react"
import { useState } from "react"
import {
  defaultSessionName,
  getActivity,
  sequenceScenes,
  totalDurationOfScenes,
} from "@some-ui/activity-catalog"
import type {
  ActivityConfigValues,
  ActivityId,
} from "@some-ui/activity-catalog"
import type { Intent } from "@some-ui/intent-kit"
import {
  failed,
  idle,
  matchIntent,
  succeeded,
  working,
} from "@some-ui/intent-kit"
import { Button } from "@some-ui/shared"
import type { SceneConfig } from "@some-ui/types"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "some-ui-utils"
import { toast } from "sonner"

import {
  composeSequentialIntents,
  useIntent,
  useIntentEffect,
} from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
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
  // One create/update pair, shared by both buttons - matching the pre-
  // migration code exactly (a single `createSession`/`updateSession`
  // mutation object backed both handlers), which is why `isSaving` used to
  // combine both `.isPending`s into one flag. `activeAction` (below) is
  // what keeps each button showing *its own* state rather than the other
  // button's leftover result now that both read the same two intents.
  const createIntent = useIntent(useCreateSession(), {
    presentation: "interactive",
  })
  const updateIntent = useIntent(useUpdateSession(), {
    presentation: "interactive",
  })

  // Which button most recently ran, so each button can tell "am I the one
  // that's in flight/just finished" apart from "the other button happens to
  // share my mutation instance". Reset on every press - never read as
  // stale, since a fresh click always overwrites it before the intent's
  // own state has had a chance to change.
  const [activeAction, setActiveAction] = useState<"draft" | "play" | null>(
    null
  )

  const anySaving =
    matchIntent(createIntent.state, {
      idle: () => false,
      working: () => true,
      succeeded: () => false,
      failed: () => false,
    }) ||
    matchIntent(updateIntent.state, {
      idle: () => false,
      working: () => true,
      succeeded: () => false,
      failed: () => false,
    })

  // The chain: a new session's "Save & Play" creates, then activates. The
  // middle failure - created, but couldn't start - is reported honestly
  // rather than folded into a generic message: `composeSequentialIntents`
  // already tells the difference between "create failed" and "activate
  // failed" (only the latter defers to the second intent), so the rewrite
  // below only fires when the session genuinely was created.
  const createdAlready = matchIntent(createIntent.state, {
    idle: () => false,
    working: () => false,
    succeeded: () => true,
    failed: () => false,
  })
  const playChain = composeSequentialIntents(
    createIntent.state,
    updateIntent.state,
    {
      first: "create",
      second: "activate",
    }
  )
  const playChainState: Intent<SessionRecord, "create" | "activate"> =
    matchIntent(playChain, {
      idle: () => idle(),
      working: (step) => working(step),
      succeeded: (value) => succeeded(value),
      failed: (error, retry) =>
        createdAlready
          ? failed(
              {
                ...error,
                summary: `Session saved, but couldn't start it. ${error.summary}`,
              },
              retry
            )
          : failed(error, retry),
    })

  // A new session's create succeeding is the terminal outcome for "Save as
  // draft" (toast + navigate to the list, lifted verbatim from the
  // pre-migration onSuccess) and the mid-chain trigger for "Save & Play"
  // (activate what was just created). `createIntent` is shared by both
  // buttons - `activeAction` is what tells this effect which one to run.
  useIntentEffect(createIntent.state, (session) => {
    if (activeAction === "draft") {
      toast("Session saved as draft")
      void navigate({ to: "/sessions" })
    } else if (activeAction === "play") {
      updateIntent.start({
        id: session.id,
        patch: { status: "active", startedAt: new Date().toISOString() },
      })
    }
  })

  // Terminal navigation, lifted verbatim from the pre-migration onSuccess
  // callbacks - same targets, same toasts, just fired from here instead of
  // from TanStack's own per-call onSuccess (useIntent doesn't re-expose
  // that; see its header).
  useIntentEffect(updateIntent.state, (session) => {
    if (activeAction === "draft") {
      toast("Draft updated")
      void navigate({ to: "/sessions" })
    } else if (activeAction === "play") {
      void navigate({
        to: "/sessions/$sessionId",
        params: { sessionId: session.id },
      })
    }
  })

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

  /**
   * Whether the step rail may jump straight to `target`.
   *
   * Deliberately expressed as the same predicate Back and Continue are
   * already governed by rather than a second, parallel one: going back is
   * unconditional (Back's own rule), and going forward needs what Continue
   * needs. A rail with its own idea of when a step is reachable is a second
   * source of truth for the wizard's validity, and the first time a step
   * grows a rule the two disagree.
   */
  const canGoToStep = (target: ComposerStep): boolean => {
    if (target === step) return true
    if (target < step) return true
    return canProceedFromStep1
  }

  const handleGoToStep = (target: ComposerStep): void => {
    if (!canGoToStep(target)) return
    setStep(target)
  }

  const finalName = sessionName.trim() || defaultSessionName(selectedIds)

  const handleSaveDraft = (): void => {
    setActiveAction("draft")
    if (existingSession) {
      updateIntent.start({
        id: existingSession.id,
        patch: {
          name: finalName,
          activities,
          scenes,
          layoutMode: arrangementMode,
          totalDurationMs: totalDurationOfScenes(scenes),
        },
      })
      return
    }

    createIntent.start({
      name: finalName,
      activities,
      scenes,
      layoutMode: arrangementMode,
    })
  }

  const handleSaveAndPlay = (): void => {
    setActiveAction("play")
    if (existingSession) {
      updateIntent.start({
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
      })
      return
    }

    // The chain's first step; useIntentEffect above picks up the success
    // and activates. See this file's top-level effects for the rest.
    createIntent.start({
      name: finalName,
      activities,
      scenes,
      layoutMode: arrangementMode,
    })
  }

  const canProceedFromStep1 = selectedIds.length > 0
  const saveDraftState: Intent<SessionRecord> =
    activeAction === "draft"
      ? existingSession
        ? updateIntent.state
        : createIntent.state
      : idle()
  const saveAndPlayState: Intent<SessionRecord, "create" | "activate"> =
    activeAction === "play"
      ? existingSession
        ? updateIntent.state
        : playChainState
      : idle()

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full max-w-3xl flex-col",
        // Every seam costs height twice over on a landscape phone: four gaps
        // at 16px is 64px of a 390px window spent on nothing.
        "gap-2 [@media(min-height:640px)]:gap-4"
      )}
    >
      {/* The rail is chrome, not content: it never scrolls out of reach, and
          it never competes with the body for height. */}
      <nav
        aria-label="Composer steps"
        className="-mx-2 flex shrink-0 items-center"
      >
        {STEP_ORDER.map((s) => {
          const reachable = canGoToStep(s)
          return (
            <div
              key={s}
              className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
            >
              <button
                type="button"
                onClick={() => handleGoToStep(s)}
                disabled={!reachable}
                aria-current={s === step ? "step" : undefined}
                aria-label={`Step ${s}: ${STEP_LABELS[s]}`}
                // 44px of touch target around a 28px dot: the dot is the
                // affordance, the padding is what a thumb actually hits.
                // Real padding rather than padding-plus-negative-margin - the
                // latter keeps the dots flush to the rail's edges but makes
                // every button paint 8px outside the nav that holds it, which
                // is a leak (docs/ui-fit) even when it looks fine.
                className="flex shrink-0 items-center gap-2 rounded-full p-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    s === step
                      ? "bg-primary text-primary-foreground"
                      : s < step
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground",
                    reachable && s !== step && "hover:bg-primary/30"
                  )}
                >
                  {s}
                </span>
                <span
                  className={cn(
                    // `sm:` is 640px of *window*, which at 780x390 leaves the
                    // rail ~490px once the sidebar has its 256 - four labels
                    // and three connectors do not fit that, and they overlap
                    // rather than wrap. `lg:` is the width the rail actually
                    // needs; below it the numbered dots are the affordance,
                    // and each button keeps the label as its aria-label.
                    "hidden text-sm lg:inline",
                    s === step ? "font-medium" : "text-muted-foreground"
                  )}
                >
                  {STEP_LABELS[s]}
                </span>
              </button>
              {s !== 4 && (
                <div className="bg-border mx-2 h-px min-w-0 flex-1" />
              )}
            </div>
          )
        })}
      </nav>

      <div className="min-h-0 flex-1">
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
      </div>

      {durationWarning && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive shrink-0 rounded-md border px-3 py-2 text-sm">
          {durationWarning}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-t pt-2 [@media(min-height:640px)]:pt-4">
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
          <div className="flex flex-wrap gap-2">
            <IntentButton
              state={saveDraftState}
              onPress={handleSaveDraft}
              idleLabel="Save as draft"
              workingLabel="Saving..."
              variant="outline"
              disabled={anySaving || durationCheck.state !== "valid"}
            />
            <IntentButton
              state={saveAndPlayState}
              onPress={handleSaveAndPlay}
              idleLabel="Save & Play"
              workingLabel="Saving..."
              workingStepLabel={(step) =>
                step === "activate" ? "Starting..." : undefined
              }
              disabled={anySaving || durationCheck.state !== "valid"}
            />
          </div>
        )}
      </div>
    </div>
  )
}
