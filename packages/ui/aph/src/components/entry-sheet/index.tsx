/**
 * One entry, opened: the three figures, where they reconcile, and the call
 * to make when they do not. Also where an entry's labels and note are
 * changed after the fact, since that is usually when the reason for a
 * mismatch comes to mind, where my figure is fixed when I mistyped it, and
 * where an entry logged at the wrong time, or twice, is removed.
 */
import type { JSX } from "react"
import { useState } from "react"
import { GoalMeter, STATUS, StatusBadge, whenOf } from "@aph/components/status"
import { keepsOnePlain, MAX_DIGITS } from "@aph/lib/draft"
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
import { Check, CheckCheck, Flag, Trash2, Undo2 } from "lucide-react"

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

      <MineEditor key={mineKey(entry)} entry={entry} store={store} />

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
          onBlur={() => {
            const kept = store.editEntry(entry.id, {
              note: note.trim() === "" ? null : note.trim(),
            })
            // Refused (the phone did not keep it): show what is kept, not
            // what was typed.
            if (!kept) setNote(entry.note ?? "")
          }}
        />
      </div>

      <RemoveControl entry={entry} store={store} />
    </div>
  )
}

function mineKey(entry: Entry): string {
  return `${entry.id}:${entry.mine?.value ?? ""}:${String(entry.mine?.approx)}`
}

/**
 * My figure, typed again and saved: the fix for a mistyped one. Keyed by the
 * figure it edits, so a save (or a change from elsewhere) starts it afresh.
 */
const MineEditor = ({
  entry,
  store,
}: {
  entry: Entry
  store: AphStore
}): JSX.Element => {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- edit buffer, keyed by the figure it edits (mineKey)
  const [digits, setDigits] = useState(String(entry.mine?.value ?? ""))
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- edit buffer, keyed by the figure it edits (mineKey)
  const [approx, setApprox] = useState(entry.mine?.approx ?? true)
  const [refused, setRefused] = useState(false)
  const valid = digits !== ""
  const unchanged =
    entry.mine !== null &&
    Number(digits) === entry.mine.value &&
    approx === entry.mine.approx

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={`aph-mine-${entry.id}`}
        className="text-muted-foreground text-xs font-semibold uppercase tracking-wide"
      >
        {entry.mine === null ? "Add mine" : "Change mine"}
      </label>
      <div className="flex gap-2">
        <Input
          id={`aph-mine-${entry.id}`}
          inputMode="numeric"
          value={digits}
          placeholder="My figure"
          onChange={(e) => {
            setRefused(false)
            setDigits(e.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS))
          }}
          className="font-mono"
        />
        <Button
          variant={approx ? "default" : "outline"}
          aria-pressed={approx}
          onClick={() => setApprox(!approx)}
          className="rounded-full"
        >
          ~ approx
        </Button>
        <Button
          variant="outline"
          disabled={!valid || unchanged}
          onClick={() =>
            setRefused(
              !store.rewriteMine(entry.id, { value: Number(digits), approx })
            )
          }
        >
          <Check aria-hidden className="mr-1 size-4" />
          Save
        </Button>
      </div>
      {refused && (
        <p role="alert" className="text-destructive text-xs">
          Not saved: the phone did not keep it.
        </p>
      )}
    </div>
  )
}

/**
 * Removing an entry, asked twice: once to open the question, once to say
 * yes. Once removed it leaves the screens, and this sheet with it.
 */
const RemoveControl = ({
  entry,
  store,
}: {
  entry: Entry
  store: AphStore
}): JSX.Element => {
  const [asking, setAsking] = useState(false)
  const [refused, setRefused] = useState(false)

  if (!asking) {
    return (
      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() => setAsking(true)}
      >
        <Trash2 aria-hidden className="mr-2 size-4" />
        Remove from the log
      </Button>
    )
  }
  return (
    <div
      role="group"
      aria-label="Remove this entry"
      className="border-destructive/40 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3"
    >
      <p className="text-sm">
        Remove this entry? It stops counting in History and the trend, and the
        record keeps it as it was.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setAsking(false)}>
          Keep it
        </Button>
        <Button
          variant="destructive"
          onClick={() => setRefused(!store.remove(entry.id))}
        >
          Remove
        </Button>
      </div>
      {refused && (
        <p role="alert" className="text-destructive text-xs">
          Not removed: the phone did not keep the change.
        </p>
      )}
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
