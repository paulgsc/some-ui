/**
 * Log a figure: mine for a checkpoint today, or theirs for an entry that is
 * waiting on one. Built for one thumb and a few seconds: the checkpoint is
 * picked from the clock, the keypad is always there, and before saving the
 * screen already says what the figure means (how far from the goal, or
 * whether it reconciles with mine).
 *
 * The form is `lib/draft.ts`; this only renders it and forwards taps.
 */
import type { JSX } from "react"
import { useReducer, useState } from "react"
import {
  CheckpointMark,
  Figures,
  STATUS,
  StatusBadge,
  whenOf,
} from "@aph/components/status"
import type { Draft, Side } from "@aph/lib/draft"
import {
  atTime,
  correcting,
  draftValue,
  newDraft,
  stepDraft,
} from "@aph/lib/draft"
import type { AphSettings, Entry } from "@aph/lib/model"
import {
  awaitingTheirs,
  checkpointById,
  formatDelta,
  formatValue,
  isUsual,
  primary,
  reconcile,
} from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { aphStore } from "@aph/lib/store"
import { useAph } from "@aph/lib/use-aph"
import { dayOf, formatDay } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { Check, Delete, Minus, Plus, TriangleAlert } from "lucide-react"
import { cn } from "some-ui-utils"

export type AphLogProps = {
  /**
   * Which figure the form opens on, read once: mine unless a link asked for
   * theirs. The form can switch, so `onSaved` says which side was saved.
   */
  initialSide?: Side
  /**
   * Theirs: the entry to fill in, when the way here already chose one. Read
   * once; without it, the newest entry awaiting their figure, at the time.
   */
  initialTarget?: string | null
  /** Called after a save, with the entry as it now stands and the side saved. */
  onSaved?: (entry: Entry, side: Side) => void
  /** The host's clock (`useMinuteClock` in www), which moves while the screen stays open. */
  now: Date
  store?: AphStore
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"] as const

/** How many waiting entries the theirs side offers before "older". */
const RECENT_WAITING = 4

function clockOf(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`
}

export const AphLog = ({
  initialSide = "mine",
  initialTarget = null,
  onSaved,
  now,
  store = aphStore,
}: AphLogProps): JSX.Element => {
  const { settings, entries } = useAph(store)
  const today = dayOf(now)
  const waiting = awaitingTheirs(settings, entries)
  const [showOlder, setShowOlder] = useState(false)

  const [raw, dispatch] = useReducer(
    stepDraft,
    undefined,
    (): Draft => newDraft(initialSide, null, initialTarget)
  )
  // The checkpoint follows the clock, and the target the waiting list,
  // until I pick one (`atTime`).
  const draft = atTime(raw, settings, entries, now)

  const value = draftValue(draft)
  const checkpoint = checkpointById(settings, draft.checkpoint)
  // Only a waiting entry can be the target: one filled since the link was
  // made (Back after saving) shows as unselected, and Save stays off.
  const targetEntry = waiting.find((e) => e.id === draft.target) ?? null
  const base =
    draft.side === "mine"
      ? (checkpoint?.goal ?? settings.usualLow)
      : (targetEntry?.mine?.value ?? targetEntry?.goal ?? settings.usualLow)

  const save = (): void => {
    const id = crypto.randomUUID()
    // The host's clock as it stands at the tap, not at the mount: the screen
    // may have sat open across midnight.
    // The entry it landed on: a new one, or the one it filled in or corrected.
    const landed = store.save(draft, {
      day: today,
      time: clockOf(now),
      id,
    })
    if (landed !== null) onSaved?.(landed, raw.side)
  }

  const shownWaiting = showOlder ? waiting : waiting.slice(0, RECENT_WAITING)
  const canSave =
    value !== null && (draft.side === "mine" || targetEntry !== null)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Whose figure"
        className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
      >
        {(["mine", "theirs"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={draft.side === s}
            onClick={() => dispatch({ type: "side", side: s })}
            className={cn(
              "h-10 rounded-md text-sm font-medium",
              draft.side === s
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            {s === "mine"
              ? "Mine"
              : `Theirs${waiting.length > 0 ? ` · ${waiting.length}` : ""}`}
          </button>
        ))}
      </div>

      {draft.side === "mine" ? (
        <div
          role="radiogroup"
          aria-label="Checkpoint"
          className="grid grid-cols-3 gap-2"
        >
          {[...settings.checkpoints, null].map((c) => {
            const id = c?.id ?? null
            const logged =
              c === null ? undefined : primary(entries, today, c.id)
            const picked = draft.checkpoint === id
            return (
              <button
                key={id ?? "other"}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() =>
                  dispatch({ type: "pickCheckpoint", checkpoint: id })
                }
                className={cn(
                  "flex h-14 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 text-left",
                  picked
                    ? "border-foreground border-2 bg-card"
                    : "border-border"
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <CheckpointMark settings={settings} checkpoint={id} />
                  {c?.label ?? "Other"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {c === null
                    ? "any time"
                    : logged?.mine != null
                      ? `${formatValue(logged.mine.value, logged.mine.approx)} logged`
                      : `goal ${formatValue(c.goal, true)}`}
                </span>
              </button>
            )
          })}
        </div>
      ) : waiting.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          Nothing is waiting on their figure.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Which entry"
          className="flex flex-col gap-1.5"
        >
          {shownWaiting.map((e) => {
            const picked = draft.target === e.id
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => dispatch({ type: "pickTarget", target: e.id })}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm",
                  picked
                    ? "border-foreground border-2 bg-card"
                    : "border-border"
                )}
              >
                <CheckpointMark settings={settings} checkpoint={e.checkpoint} />
                <span className="font-medium">{formatDay(e.day)}</span>
                <span className="text-muted-foreground">
                  {whenOf(settings, e)}
                </span>
                <span className="ml-auto">
                  <Figures entry={e} className="text-sm" />
                </span>
              </button>
            )
          })}
          {waiting.length > RECENT_WAITING && (
            <button
              type="button"
              onClick={() => setShowOlder(!showOlder)}
              className="text-muted-foreground h-9 text-sm underline-offset-4 hover:underline"
            >
              {showOlder ? "Fewer" : `${waiting.length - RECENT_WAITING} older`}
            </button>
          )}
        </div>
      )}

      <Readout
        settings={settings}
        draft={draft}
        value={value}
        base={base}
        targetEntry={targetEntry}
      />

      {value !== null && !isUsual(settings, value) && (
        <p className="bg-warning/10 text-warning flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm">
          <TriangleAlert aria-hidden className="size-4" />
          Outside your usual {formatValue(settings.usualLow)}–
          {formatValue(settings.usualHigh)}. Typo?
        </p>
      )}

      <div className="flex justify-center gap-2">
        <Button
          variant="outline"
          aria-label={`Minus ${settings.step}`}
          onClick={() => dispatch({ type: "nudge", by: -settings.step, base })}
          className="rounded-full font-mono"
        >
          <Minus aria-hidden className="mr-1 size-4" />
          {settings.step}
        </Button>
        {draft.side === "mine" && (
          <Button
            variant={draft.approx ? "default" : "outline"}
            aria-pressed={draft.approx}
            onClick={() => dispatch({ type: "toggleApprox" })}
            className="rounded-full"
          >
            ~ approx
          </Button>
        )}
        <Button
          variant="outline"
          aria-label={`Plus ${settings.step}`}
          onClick={() => dispatch({ type: "nudge", by: settings.step, base })}
          className="rounded-full font-mono"
        >
          <Plus aria-hidden className="mr-1 size-4" />
          {settings.step}
        </Button>
      </div>

      {draft.side === "mine" && settings.labels.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Labels">
          {settings.labels.map((label) => {
            const on = draft.labels.includes(label)
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => dispatch({ type: "toggleLabel", label })}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm",
                  on
                    ? "bg-foreground text-background border-foreground"
                    : "border-border"
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              for (const digit of k) dispatch({ type: "digit", digit })
            }}
            className="bg-muted hover:bg-accent h-12 rounded-lg font-mono text-xl"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete digit"
          onClick={() => dispatch({ type: "backspace" })}
          className="bg-muted hover:bg-accent flex h-12 items-center justify-center rounded-lg"
        >
          <Delete aria-hidden className="size-5" />
        </button>
      </div>

      <Button
        size="lg"
        disabled={!canSave}
        onClick={save}
        className="h-14 text-base"
      >
        <Check aria-hidden className="mr-2 size-5" />
        {draft.side === "mine"
          ? `${correcting(entries, draft, today) === undefined ? "Save" : "Correct"} mine · ${checkpoint?.label ?? "now"}`
          : targetEntry === null
            ? "Save theirs"
            : `Save theirs · ${formatDay(targetEntry.day)} ${whenOf(settings, targetEntry)}`}
      </Button>
    </div>
  )
}

/**
 * The figure being typed, big, and what it means before it is saved: for
 * mine, the distance from the goal; for theirs, whether it reconciles with
 * mine, in the status's own colour.
 */
const Readout = ({
  settings,
  draft,
  value,
  base,
  targetEntry,
}: {
  settings: AphSettings
  draft: Draft
  value: number | null
  base: number
  targetEntry: Entry | null
}): JSX.Element => {
  const checkpoint = checkpointById(settings, draft.checkpoint)
  const preview =
    draft.side === "theirs" && targetEntry !== null && value !== null
      ? reconcile(settings, { ...targetEntry, theirs: { value }, review: null })
      : null

  return (
    <div
      className={cn(
        "bg-card flex flex-col items-center gap-1 rounded-xl border px-4 py-3 transition-colors",
        preview !== null && STATUS[preview.status].surface
      )}
    >
      <div
        aria-live="polite"
        className={cn(
          "font-mono text-5xl font-semibold tabular-nums tracking-tight",
          value === null && "text-muted-foreground/50"
        )}
      >
        {draft.side === "mine" && draft.approx && (
          <span className="text-muted-foreground mr-1 text-3xl">~</span>
        )}
        {formatValue(value ?? base)}
      </div>
      <div className="text-muted-foreground text-center text-sm">
        {draft.side === "mine" ? (
          checkpoint === null ? (
            "No goal off the checkpoints"
          ) : value === null ? (
            `Goal ${formatValue(checkpoint.goal, true)} at ${checkpoint.label}`
          ) : (
            <>
              <span className="text-foreground font-mono font-medium">
                {formatDelta(value - checkpoint.goal)}
              </span>{" "}
              against the goal of {formatValue(checkpoint.goal, true)}
            </>
          )
        ) : preview === null ? (
          targetEntry?.mine == null ? (
            "Their figure"
          ) : (
            `Mine was ${formatValue(targetEntry.mine.value, targetEntry.mine.approx)}`
          )
        ) : (
          <span className="flex items-center gap-2">
            <StatusBadge status={preview.status} />
            {preview.gap !== null && (
              <span className="font-mono">
                {formatDelta(preview.gap)} vs mine
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
