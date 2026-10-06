/**
 * One entry, opened: the three figures, where they reconcile, and the call
 * to make when they do not. Also where an entry's labels and note are
 * changed after the fact, since that is usually when the reason for a
 * mismatch comes to mind.
 */
import type { JSX } from "react"
import { useState } from "react"
import { GoalMeter, STATUS, StatusBadge, whenOf } from "@aph/components/status"
import { keepsOnePlain } from "@aph/lib/draft"
import type { Entry } from "@aph/lib/model"
import { formatDelta, formatValue, labelsFor, reconcile } from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { useAph } from "@aph/lib/use-aph"
import { cn, formatDay, formatWeekday } from "@some-ui/core-utils"
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { CheckCheck, Flag, Undo2 } from "lucide-react"

export type EntrySheetProps = {
  entryId: string | null
  onClose: () => void
  /** Where "Enter their figure" goes: the logger, on the theirs side. */
  onEnterTheirs?: (entryId: string) => void
  store: AphStore
}

export const EntrySheet = ({
  entryId,
  onClose,
  onEnterTheirs,
  store,
}: EntrySheetProps): JSX.Element => {
  const { entries } = useAph(store)
  const entry = entries.find((e) => e.id === entryId) ?? null

  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        data-scroll-intent="long-form"
        className={
          // scroll-intent: long-form — on a short phone held sideways the
          // figures, the call and the labels outgrow the sheet; the page
          // behind stays put while the sheet scrolls.
          "max-h-[85dvh] overflow-y-auto rounded-t-2xl"
        }
      >
        {entry !== null && (
          <EntryDetail
            key={entry.id}
            entry={entry}
            store={store}
            onEnterTheirs={onEnterTheirs}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

const EntryDetail = ({
  entry,
  store,
  onEnterTheirs,
}: {
  entry: Entry
  store: AphStore
  onEnterTheirs?: (entryId: string) => void
}): JSX.Element => {
  const { settings, entries } = useAph(store)
  const { status, gap } = reconcile(settings, entry)
  const chips = labelsFor(settings, entry)
  // An edit buffer for the note I'm typing: seeded from the entry it edits,
  // and EntrySheet keys this by `entry.id`, so another entry is a fresh one.
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- edit buffer, keyed by the entry it edits (see above)
  const [note, setNote] = useState(entry.note ?? "")

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <SheetHeader className="text-left">
        <SheetTitle>
          {formatWeekday(entry.day)} {formatDay(entry.day)} ·{" "}
          {whenOf(settings, entry)}
        </SheetTitle>
        <SheetDescription asChild>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {gap !== null && (
              <span className="font-mono text-sm">
                theirs {formatDelta(gap)} vs mine
              </span>
            )}
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="grid grid-cols-3 gap-2">
        <Figure
          label="Mine"
          value={
            entry.mine === null
              ? null
              : formatValue(entry.mine.value, entry.mine.approx)
          }
        />
        <Figure
          label="Theirs"
          value={entry.theirs === null ? null : formatValue(entry.theirs.value)}
          className={STATUS[status].surface}
        />
        <Figure
          label="Goal"
          value={entry.goal === null ? null : formatValue(entry.goal, true)}
        />
      </div>

      {entry.goal !== null && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>Against the goal</span>
          <GoalMeter entry={entry} />
        </div>
      )}

      {status === "awaiting" && onEnterTheirs !== undefined && (
        <Button onClick={() => onEnterTheirs(entry.id)}>
          Enter their figure
        </Button>
      )}
      {status === "review" && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => store.review(entry.id, "agreed")}
          >
            <CheckCheck aria-hidden className="text-success mr-2 size-5" />
            Agree with theirs
          </Button>
          <Button
            variant="outline"
            onClick={() => store.review(entry.id, "flagged")}
          >
            <Flag aria-hidden className="text-destructive mr-2 size-4" />
            Flag it
          </Button>
        </div>
      )}
      {(status === "agreed" || status === "flagged") && (
        <Button variant="ghost" onClick={() => store.review(entry.id, null)}>
          <Undo2 aria-hidden className="mr-2 size-4" />
          Take back “{STATUS[status].label.toLowerCase()}”
        </Button>
      )}

      {chips.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Labels
          </span>
          <div className="flex flex-wrap gap-2">
            {chips.map((label) => {
              const on = entry.labels.includes(label)
              const next = on
                ? entry.labels.filter((l) => l !== label)
                : [...entry.labels, label]
              const allowed = keepsOnePlain(entries, entry.id, next)
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  disabled={!allowed}
                  onClick={() => store.editEntry(entry.id, { labels: next })}
                  className={cn(
                    "h-9 rounded-full border px-3.5 text-sm disabled:opacity-60",
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
          {!keepsOnePlain(entries, entry.id, []) &&
            entry.labels.length === 1 && (
              <p className="text-muted-foreground text-xs">
                A plain figure is already logged here, so this comparison keeps
                at least one label.
              </p>
            )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`aph-note-${entry.id}`}
          className="text-muted-foreground text-xs font-semibold uppercase tracking-wide"
        >
          Note
        </label>
        <Input
          id={`aph-note-${entry.id}`}
          value={note}
          maxLength={140}
          placeholder="Anything a label doesn’t say"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() =>
            store.editEntry(entry.id, {
              note: note.trim() === "" ? null : note.trim(),
            })
          }
        />
      </div>
    </div>
  )
}

const Figure = ({
  label,
  value,
  className,
}: {
  label: string
  value: string | null
  className?: string
}): JSX.Element => (
  <div
    className={cn(
      "bg-card flex flex-col gap-0.5 rounded-lg border p-3",
      className
    )}
  >
    <span className="text-muted-foreground text-xs">{label}</span>
    <span
      className={cn(
        "font-mono text-lg font-semibold tabular-nums",
        value === null && "text-muted-foreground"
      )}
    >
      {value ?? "—"}
    </span>
  </div>
)
