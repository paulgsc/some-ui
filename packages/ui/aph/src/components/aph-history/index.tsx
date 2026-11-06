/**
 * Every day since tracking began, newest first, each entry tinted by where
 * its reconciliation stands, so a scroll down the list reads as a colour
 * strip before a single number is read. The counts on top double as filters:
 * tap "Your call" and only what waits on me is left.
 *
 * Missed days stay visible, folded into one line per run, because a gap is
 * information too. One still within `loggableDays` opens the logger on its
 * latest day.
 *
 * Drafts head the list: what I logged and have not yet submitted, picked
 * and submitted together, since none goes home, and no other day can be
 * logged, until they are.
 */
import type { JSX } from "react"
import { useState } from "react"
import { EntrySheet } from "@aph/components/entry-sheet"
import {
  CheckpointMark,
  Figures,
  STATUS,
  StatusIcon,
  whenOf,
} from "@aph/components/status"
import type { AphSettings, Entry, ReconcileStatus } from "@aph/lib/model"
import {
  entriesOn,
  formatDelta,
  formatValue,
  goalDelta,
  history,
  isDraft,
  loggableDays,
  reconcile,
  RECONCILE_ORDER,
  stats,
} from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { aphStore } from "@aph/lib/store"
import { useAph } from "@aph/lib/use-aph"
import { cn, dayOf, formatDay, formatWeekday } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"
import { Send } from "lucide-react"

export type AphHistoryProps = {
  /** Where "Enter their figure" goes: the logger, on the theirs side. */
  onEnterTheirs?: (entryId: string) => void
  /** Where a missed day goes: the logger, on mine, for that day. */
  onLogDay?: (day: string) => void
  /** The host's clock (`useMinuteClock` in www), which moves while the screen stays open. */
  now: Date
  store?: AphStore
}

export const AphHistory = ({
  onEnterTheirs,
  onLogDay,
  now,
  store = aphStore,
}: AphHistoryProps): JSX.Element => {
  const { settings, entries } = useAph(store)
  const [filter, setFilter] = useState<ReconcileStatus | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const today = dayOf(now)
  const reachable = loggableDays(settings, today)
  const counts = stats(settings, entries, today).reconciliation
  const shows = (e: Entry): boolean =>
    filter === null || reconcile(settings, e).status === filter
  const rows = history(settings, entries, today).filter(
    (r) => filter === null || (r.kind === "day" && r.entries.some(shows))
  )

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2">
      <Drafts
        settings={settings}
        entries={entries}
        store={store}
        onOpen={setOpen}
      />

      <div
        role="group"
        aria-label="Show only"
        className="flex flex-wrap gap-1.5 pb-1"
      >
        {/* The chip that is on stays even at zero, or settling the last
            entry it shows would leave a filter nothing can clear. */}
        {RECONCILE_ORDER.filter((s) => counts[s] > 0 || filter === s).map(
          (s) => {
            const on = filter === s
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(on ? null : s)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
                  STATUS[s].surface,
                  on && "ring-foreground ring-2"
                )}
              >
                <StatusIcon status={s} />
                <span className="font-semibold tabular-nums">{counts[s]}</span>
                <span className={STATUS[s].tone}>{STATUS[s].label}</span>
              </button>
            )
          }
        )}
      </div>

      {rows.map((row) =>
        row.kind === "gap" ? (
          <GapRow
            key={row.from}
            from={row.from}
            to={row.to}
            days={row.days}
            // The gap's latest day, the one most likely still remembered.
            onLog={
              onLogDay !== undefined && reachable.includes(row.to)
                ? (): void => onLogDay(row.to)
                : undefined
            }
          />
        ) : (
          <section
            key={row.day}
            aria-label={`${formatWeekday(row.day)} ${formatDay(row.day)}`}
            className="bg-card flex gap-3 rounded-xl border p-2"
          >
            <div className="flex w-12 shrink-0 flex-col pl-1 pt-1">
              <span className="text-sm font-semibold">
                {formatDay(row.day)}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatWeekday(row.day)}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {row.entries.length === 0 && (
                <span className="text-muted-foreground py-1.5 text-sm">
                  Nothing yet today
                </span>
              )}
              {row.entries.filter(shows).map((e) => {
                const status = reconcile(settings, e).status
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setOpen(e.id)}
                    aria-label={`${whenOf(settings, e)}: ${STATUS[status].label}`}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm",
                      STATUS[status].surface
                    )}
                  >
                    <CheckpointMark
                      settings={settings}
                      checkpoint={e.checkpoint}
                    />
                    <span
                      className={cn(
                        "w-11 shrink-0 text-xs",
                        e.checkpoint === null && e.time === null
                          ? "text-warning font-semibold"
                          : "text-muted-foreground"
                      )}
                    >
                      {whenOf(settings, e)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      {isDraft(e) && (
                        <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                          Draft
                        </span>
                      )}
                      <Figures entry={e} className="text-sm font-semibold" />
                      {(e.labels.length > 0 || e.note !== null) && (
                        <span className="text-muted-foreground truncate text-xs">
                          {[...e.labels, e.note].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <StatusIcon status={status} />
                      {goalDelta(e) !== null && (
                        <span
                          title="Against the goal"
                          className="text-muted-foreground font-mono text-[11px] tabular-nums"
                        >
                          {formatDelta(goalDelta(e) ?? 0)}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      )}

      {filter === null && (
        <p className="text-muted-foreground px-1 pt-1 text-xs">
          Tracking since {formatDay(settings.since)} · goals{" "}
          {settings.checkpoints
            .map((c) => `${c.label} ${formatValue(c.goal, true)}`)
            .join(" · ")}
        </p>
      )}

      <EntrySheet
        entryId={open}
        onClose={() => setOpen(null)}
        onEnterTheirs={onEnterTheirs}
        store={store}
      />
    </div>
  )
}

/**
 * The drafts, oldest day first, each with a box to pick it, and one button
 * that submits the ones picked. Tapping a draft's figures opens it, where it
 * can be changed or deleted. Nothing when there are none.
 */
const Drafts = ({
  settings,
  entries,
  store,
  onOpen,
}: {
  settings: AphSettings
  entries: ReadonlyArray<Entry>
  store: AphStore
  onOpen: (id: string) => void
}): JSX.Element | null => {
  const [picked, setPicked] = useState<ReadonlyArray<string>>([])
  const [refused, setRefused] = useState(false)
  const days = [...new Set(entries.filter(isDraft).map((e) => e.day))].sort()
  const drafts = days.flatMap((day) =>
    entriesOn(settings, entries, day).filter(isDraft)
  )
  if (drafts.length === 0) return null
  // Only drafts still waiting count as picked: one submitted or deleted
  // since drops out.
  const chosen = drafts.filter((e) => picked.includes(e.id)).map((e) => e.id)
  const all = chosen.length === drafts.length
  const toggle = (id: string): void =>
    setPicked(
      chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id]
    )

  return (
    <section
      aria-label="Drafts"
      className="border-warning/40 bg-warning/5 flex flex-col gap-2 rounded-xl border p-2"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold">
          {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} not yet
          submitted
        </span>
        <button
          type="button"
          onClick={() => setPicked(all ? [] : drafts.map((e) => e.id))}
          // One width for either word: it sits at the row's end, so a word
          // that changed its width would move it under the thumb (HS1).
          className="text-muted-foreground h-9 w-24 px-2 text-right text-sm underline-offset-4 hover:underline"
        >
          {all ? "Pick none" : "Pick all"}
        </button>
      </div>
      {drafts.map((e) => (
        <div
          key={e.id}
          className="bg-card flex min-h-11 items-center gap-2 rounded-lg border px-2"
        >
          <input
            type="checkbox"
            aria-label={`Pick ${formatDay(e.day)} ${whenOf(settings, e)}`}
            checked={chosen.includes(e.id)}
            onChange={() => toggle(e.id)}
            className="size-5 shrink-0"
          />
          <button
            type="button"
            onClick={() => onOpen(e.id)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm"
          >
            <span className="w-16 shrink-0 font-medium">
              {formatDay(e.day)}
            </span>
            <span className="text-muted-foreground w-11 shrink-0 text-xs">
              {whenOf(settings, e)}
            </span>
            <Figures entry={e} className="text-sm font-semibold" />
          </button>
        </div>
      ))}
      <Button
        disabled={chosen.length === 0}
        onClick={() => {
          const kept = store.submit(chosen)
          setRefused(!kept)
          if (kept) setPicked([])
        }}
      >
        <Send aria-hidden className="mr-2 size-4" />
        Submit {chosen.length === 0 ? "" : `${chosen.length} `}
        {chosen.length === 1 ? "draft" : "drafts"}
      </Button>
      {refused && (
        <Notice role="alert" tone="danger" onDismiss={() => setRefused(false)}>
          Not submitted: the phone did not keep the change.
        </Notice>
      )}
    </section>
  )
}

/** A run of days with nothing logged; a button while it can still be logged. */
const GapRow = ({
  from,
  to,
  days,
  onLog,
}: {
  from: string
  to: string
  days: number
  onLog: (() => void) | undefined
}): JSX.Element => {
  const when = `${
    days === 1
      ? `${formatWeekday(from)} ${formatDay(from)}`
      : `${formatDay(from)} – ${formatDay(to)} · ${days} days`
  } · not logged`
  const className =
    "text-muted-foreground bg-muted/40 flex h-9 items-center rounded-xl px-3 text-sm"
  return onLog === undefined ? (
    <div className={className}>{when}</div>
  ) : (
    <button
      type="button"
      onClick={onLog}
      className={cn(className, "hover:bg-accent text-left")}
    >
      {when}
      <span className="text-foreground ml-auto font-medium">
        Log {formatDay(to)}
      </span>
    </button>
  )
}
