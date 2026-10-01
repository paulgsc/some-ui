import type { ComponentType, JSX, ReactNode } from "react"
import { useRef, useState } from "react"
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
import { BottomTabBar, Button } from "@some-ui/shared"
import type { SceneConfig } from "@some-ui/types"
import { useNavigate } from "@tanstack/react-router"
import {
  ClipboardCheck,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  SlidersHorizontal,
} from "lucide-react"
import { cn, useIsMobile, useShowOnScrollUp } from "some-ui-utils"
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
import type { ComposerPane, ComposerStep } from "./panes"
import {
  PANE_LABELS,
  PANE_ORDER,
  PANE_STEP,
  STEP_LABELS,
  STEP_ORDER,
  STEP_PANE,
} from "./panes"
import { ReviewStep } from "./review-step"
import { buildSessionActivities } from "./utils"

type ArrangementMode = "basic" | "advanced"

const PANE_ICONS: Record<
  ComposerPane,
  ComponentType<{ className?: string }>
> = {
  browse: LayoutGrid,
  added: ListChecks,
  configure: SlidersHorizontal,
  arrange: ListOrdered,
  review: ClipboardCheck,
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

  // Whether firing a *fresh* `createIntent.start` (a new `POST /sessions`)
  // is unsafe given what `createIntent` itself already knows - independent
  // of which button is `activeAction`. Two distinct cases, both bot-review
  // findings:
  //
  // 1. `failed` with `blocksResubmission` - the create's own POST timed out
  //    ambiguously (see `client.ts`'s `isNonIdempotent`/`FileHostUnreachableError`).
  // 2. `succeeded` - a session was *definitely* created already (e.g. "Save
  //    & Play" created it, then the follow-up activate PATCH failed and the
  //    composer stayed mounted showing that failure). `createIntent` mints
  //    at most one session per composer instance; once it has, no button
  //    should ever fire a second `POST /sessions` from the same instance.
  //
  // `updateIntent` (PATCH, used once `existingSession` is set, or for the
  // activate step of the chain) never needs this itself: a PATCH timeout is
  // always retryable, so it can never set `blocksResubmission`, and it can't
  // mint a duplicate resource.
  const createBlocked = matchIntent(createIntent.state, {
    idle: () => false,
    working: () => false,
    succeeded: () => true,
    failed: (error) => !error.retryable && error.blocksResubmission === true,
  })

  /**
   * Whether a composed button's *own* state currently offers a legitimate
   * retry (`IntentButton`'s "Try again", wired to the composed `retry`
   * closure) - as opposed to a state that would fall back to `onPress`
   * (idle, or a non-retryable failure `IntentButton` doesn't itself block).
   *
   * `createBlocked` alone isn't enough to decide whether to force-disable a
   * button: gating it by `activeAction` (an earlier version of this fix)
   * correctly left a legitimate 5xx activate-retry enabled, but a bot review
   * caught the case that distinction missed - a *non-retryable* 4xx on the
   * activate PATCH after a successful create. There, `saveAndPlayState` is
   * `failed({retryable: false, blocksResubmission: undefined}, retry)`:
   * `IntentButton`'s own logic sees a non-*blocked* non-retryable failure and
   * falls back to `onClick={onPress}` (its generally-correct rule for a
   * single mutation, where firing `onPress` again is just a fresh, safe
   * attempt) - but `onPress` here is `handleSaveAndPlay`, which restarts the
   * *whole* chain from `createIntent.start` because it has no way to know a
   * session already exists, mismatching that generic rule against this
   * composer's own compound one. Checking "does this button's own state
   * offer a retry" instead of "is this the active button" closes that gap
   * without special-casing activeAction at all: a button is force-disabled
   * by `createBlocked` unless its own composed state is a *retryable*
   * failure - a `disabled` HTML button fires no click, so this also removes
   * the risky `onClick` outright, not just its visible affordance.
   */
  function hasOwnRetryableFailure<T, TStep extends string = never>(
    state: Intent<T, TStep>
  ): boolean {
    return matchIntent<T, boolean, TStep>(state, {
      idle: () => false,
      working: () => false,
      succeeded: () => false,
      failed: (error) => error.retryable,
    })
  }

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

  // One position for both layouts (see `./panes`): the wizard reads it as a
  // step, the phone's tab bar as a pane.
  const [pane, setPane] = useState<ComposerPane>("browse")
  // The catalogue's search, here for the same reason as `pane`: the picker
  // that shows it is a different mount in each layout.
  const [query, setQuery] = useState("")
  const step = PANE_STEP[pane]
  const isMobile = useIsMobile()
  const scope = useRef<HTMLDivElement | null>(null)
  const barShown = useShowOnScrollUp(scope, pane)
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

  const goToStep = (target: ComposerStep): void => {
    setPane(STEP_PANE[target])
  }

  const handleNext = (): void => {
    const index = STEP_ORDER.indexOf(step)
    goToStep(STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)] ?? step)
  }

  const handleBack = (): void => {
    const index = STEP_ORDER.indexOf(step)
    goToStep(STEP_ORDER[Math.max(index - 1, 0)] ?? step)
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
    goToStep(target)
  }

  /** The phone's tabs are held to the same rule as the rail: a pane is as reachable as its step. */
  const canGoToPane = (target: ComposerPane): boolean =>
    canGoToStep(PANE_STEP[target])

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

  // The two save controls, once: the wizard's footer holds them on step 4, and
  // a phone - which has no footer - holds them in the Review pane.
  const saveActions = (
    <>
      <IntentButton
        state={saveDraftState}
        onPress={handleSaveDraft}
        idleLabel="Save as draft"
        workingLabel="Saving..."
        variant="outline"
        disabled={
          anySaving ||
          // Forced disabled whenever a fresh create is unsafe, *unless*
          // this button's own state currently offers a legitimate
          // retry of its own (see `hasOwnRetryableFailure`'s header) -
          // not gated by `activeAction`, which let a non-retryable
          // activate-PATCH failure on the *active* button slip through
          // to its `onPress` fallback.
          (createBlocked && !hasOwnRetryableFailure(saveDraftState)) ||
          durationCheck.state !== "valid"
        }
      />
      <IntentButton
        state={saveAndPlayState}
        onPress={handleSaveAndPlay}
        idleLabel="Save & Play"
        workingLabel="Saving..."
        workingStepLabel={(step) =>
          step === "activate" ? "Starting..." : undefined
        }
        disabled={
          anySaving ||
          (createBlocked && !hasOwnRetryableFailure(saveAndPlayState)) ||
          durationCheck.state !== "valid"
        }
      />
    </>
  )

  const durationBanner = durationWarning ? (
    <div className="border-destructive/50 bg-destructive/10 text-destructive shrink-0 rounded-md border px-3 py-2 text-sm">
      {durationWarning}
    </div>
  ) : null

  // On a phone the composer is the lesson CRM's shape (`@some-ui/lesson-crm`):
  // one concern per pane, and the bottom tab bar - not a Back and a Continue -
  // is how they are switched. Every pane stays mounted and only the current
  // one shows, so leaving Browse does not forget what was typed into its
  // search or which page it was on, exactly as the CRM keeps its prompt's
  // level. A hidden pane measures 0px and `useFittedPage` sits out until it is
  // shown, so the ones nobody has opened cost nothing to keep.
  const panes: Record<ComposerPane, ReactNode> = {
    browse: (
      <ActivityPickerStep
        section="catalogue"
        items={items}
        onAdd={handleAddActivity}
        onRemove={handleRemoveActivity}
        query={query}
        onQueryChange={setQuery}
      />
    ),
    added: (
      <ActivityPickerStep
        section="manifest"
        items={items}
        onAdd={handleAddActivity}
        onRemove={handleRemoveActivity}
        query={query}
        onQueryChange={setQuery}
        onBrowse={() => setPane("browse")}
      />
    ),
    configure: (
      <ConfigureStep items={items} onFieldChange={handleFieldChange} />
    ),
    arrange: (
      <ArrangementStep
        basicScenes={basicScenes}
        mode={arrangementMode}
        advancedScenes={advancedScenes}
        onEnableAdvanced={handleEnableAdvanced}
        onDisableAdvanced={handleDisableAdvanced}
        onScenesChange={setAdvancedScenes}
      />
    ),
    review: (
      <ReviewStep
        items={items}
        scenes={scenes}
        mode={arrangementMode}
        sessionName={sessionName}
        onSessionNameChange={setSessionName}
        defaultName={defaultSessionName(selectedIds)}
        actions={saveActions}
      />
    ),
  }
  const shownPane: ComposerPane = canGoToPane(pane) ? pane : "browse"

  return (
    <div
      ref={scope}
      className={cn(
        "flex h-full min-h-0 w-full max-w-3xl flex-col",
        // Every seam costs height twice over on a landscape phone: four gaps
        // at 16px is 64px of a 390px window spent on nothing.
        "gap-2 [@media(min-height:640px)]:gap-4"
      )}
    >
      {isMobile ? (
        <>
          <div className="min-h-0 flex-1">
            {PANE_ORDER.map((candidate) => (
              <div
                key={candidate}
                id={`composer-pane-${candidate}`}
                role="tabpanel"
                aria-labelledby={`composer-tab-${candidate}`}
                hidden={candidate !== shownPane}
                className="h-full min-h-0"
              >
                {panes[candidate]}
              </div>
            ))}
          </div>

          {durationBanner}

          <BottomTabBar
            tabs={PANE_ORDER.map((candidate) => ({
              id: candidate,
              label: PANE_LABELS[candidate],
              icon: PANE_ICONS[candidate],
              disabled: !canGoToPane(candidate),
              badge: candidate === "added" ? items.length : undefined,
            }))}
            current={shownPane}
            onChange={setPane}
            shown={barShown}
            label="Composer panes"
            idPrefix="composer"
          />
        </>
      ) : (
        <>
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
                        // The rail only shows label text at `lg:`: below it the
                        // numbered dots are the affordance, and each button
                        // keeps the label as its aria-label. (A phone, below
                        // `md`, does not get this rail at all - it gets the
                        // tab bar above.)
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
                query={query}
                onQueryChange={setQuery}
              />
            )}
            {step === 2 && panes.configure}
            {step === 3 && panes.arrange}
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

          {durationBanner}

          <div className="flex shrink-0 items-center justify-between border-t pt-2 [@media(min-height:640px)]:pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
            >
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
              <div className="flex flex-wrap gap-2">{saveActions}</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
