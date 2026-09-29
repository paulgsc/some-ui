import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import type { TopikMetadata } from "@topik/lib/topik"
import type {
  Selection,
  SelectionReason,
} from "@topik/lib/topik/core/lesson-selection"
import { topikLevelOf } from "@topik/lib/topik/core/lesson-selection"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import {
  BookOpenText,
  ChevronRight,
  Loader2,
  PlayCircle,
  Sparkles,
  X,
} from "lucide-react"
import { assertNever, cn } from "some-ui-utils"

type MaterialListProps = {
  /** This level's served lessons, in order; the first is up next. */
  order: Array<Selection>
  /** Served lessons at other levels. */
  others: Array<TopikMetadata>
  level: number
  /** The learner moving to another level; the survey never does. */
  onLevel: (level: number) => void
  /** The lesson pasted this session, if any. */
  pasted?: TopikMetadata | null
  loading: boolean
  error: string | null
  resume: { topik: TopikMetadata; conversation: number } | null
  onSelect: (key: string) => void
  onReload: () => void
  /** Opens the opt-in loop; absent where it isn't offered. */
  onCreate?: () => void
  /** Lets the pasted lesson go before the session ends. */
  onForget?: () => void
  /**
   * "Keep on this account" for the pasted lesson, where the host has a
   * learner shelf; shown under it. Absent, the lesson lasts the session.
   */
  keep?: JSX.Element
  /** Opens the read-aloud drill; absent where it isn't offered. */
  onReadAloud?: () => void
}

const details = (item: TopikMetadata): string => {
  const level = topikLevelOf(item.tags)
  return [
    `${item.batchCount} conversations`,
    level ? `TOPIK ${level}` : item.difficulty,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Why a lesson is up next, in the learner's words (canon Rem. 3.5). */
export function reasonText(reasons: Array<SelectionReason>): string | null {
  const parts = reasons.map((reason) => {
    switch (reason.kind) {
      case "brings-back": {
        return `Brings back ${reason.relations.join(", ")}.`
      }
      case "smaller": {
        return reason.because === "drained"
          ? "Shorter, since you were running out of steam."
          : "Shorter, since the last one felt too hard."
      }
      case "larger": {
        return "Longer, since the last one felt too easy."
      }
      default: {
        return assertNever(reason)
      }
    }
  })
  return parts.length > 0 ? parts.join(" ") : null
}

const Heading = ({ children }: { children: string }): JSX.Element => (
  <h2 className="text-muted-foreground px-1 pt-2 text-xs font-medium tracking-wider uppercase">
    {children}
  </h2>
)

const Row = ({
  item,
  onSelect,
  note,
}: {
  item: TopikMetadata
  onSelect: (key: string) => void
  note?: string
}): JSX.Element => (
  <li className="bg-card border-border flex min-h-16 items-stretch rounded-2xl border">
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{item.displayName}</span>
        {item.description && (
          <span className="text-muted-foreground line-clamp-2 text-sm">
            {item.description}
          </span>
        )}
        <span className="text-muted-foreground mt-1 block text-xs">
          {note ? `${details(item)} · ${note}` : details(item)}
        </span>
      </span>
      <ChevronRight className="text-muted-foreground size-5 shrink-0" />
    </button>
  </li>
)

/**
 * The handheld start screen. What comes next is chosen for the learner from
 * this week's lessons, by their recent surveys, within their level (canon
 * Rem. 3.5), and it is one tap away. So is anywhere they left off.
 */
export const MaterialList = ({
  order,
  others,
  level,
  onLevel,
  pasted = null,
  loading,
  error,
  resume,
  onSelect,
  onReload,
  onCreate,
  onForget,
  keep,
  onReadAloud,
}: MaterialListProps): JSX.Element => {
  const [next, ...rest] = order
  const why = next ? reasonText(next.reasons) : null
  const empty = !loading && !error && order.length === 0 && others.length === 0

  return (
    <div
      data-slot="topik-material-list"
      data-scroll-intent="long-form"
      className={
        // scroll-intent: long-form — the catalogue is as long as the library;
        // a list a thumb scrolls is the phone's native way to browse one.
        "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
      }
    >
      {resume && (
        <button
          type="button"
          onClick={() => onSelect(resume.topik.key)}
          className="bg-primary text-primary-foreground flex min-h-16 items-center gap-3 rounded-2xl p-4 text-left"
        >
          <PlayCircle className="size-8 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium tracking-wider uppercase opacity-80">
              Continue
            </span>
            <span className="block truncate font-semibold">
              {resume.topik.displayName}
            </span>
            <span className="block text-sm opacity-80">
              Conversation {resume.conversation + 1} of{" "}
              {resume.topik.batchCount}
            </span>
          </span>
        </button>
      )}

      <div
        role="radiogroup"
        aria-label="Your level"
        className="grid grid-cols-6 gap-1.5"
      >
        {TOPIK_LEVELS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={level === value}
            aria-label={`TOPIK ${value}`}
            onClick={() => onLevel(value)}
            className={cn(
              "h-9 rounded-lg border text-sm font-semibold",
              level === value
                ? "border-primary/40 bg-primary/15"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {next && (
        <section aria-label="Up next" className="flex flex-col gap-2">
          <Heading>Up next</Heading>
          <button
            type="button"
            onClick={() => onSelect(next.item.key)}
            className="border-primary/40 bg-primary/10 flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {next.item.displayName}
              </span>
              {next.item.description && (
                <span className="text-muted-foreground line-clamp-2 text-sm">
                  {next.item.description}
                </span>
              )}
              <span className="text-muted-foreground mt-1 block text-xs">
                {why ?? details(next.item)}
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-5 shrink-0" />
          </button>
        </section>
      )}

      {onReadAloud && (
        <button
          type="button"
          onClick={onReadAloud}
          className="bg-card border-border flex min-h-16 shrink-0 items-center gap-3 rounded-2xl border p-4 text-left"
        >
          <BookOpenText className="text-primary size-6 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Read aloud</span>
            <span className="text-muted-foreground block text-sm">
              Read words and sentences aloud, then hear them. It runs by itself.
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-5 shrink-0" />
        </button>
      )}

      {pasted && (
        <section
          aria-label="Pasted this session"
          className="flex flex-col gap-2"
        >
          <Heading>Pasted this session</Heading>
          <div className="bg-card border-border flex min-h-16 items-stretch rounded-2xl border">
            <button
              type="button"
              onClick={() => onSelect(pasted.key)}
              className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {pasted.displayName}
                </span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {details(pasted)} · until this tab closes
                </span>
              </span>
            </button>
            {onForget && (
              <button
                type="button"
                aria-label={`Forget ${pasted.displayName}`}
                onClick={onForget}
                className="text-muted-foreground flex w-12 shrink-0 items-center justify-center"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {keep}
        </section>
      )}

      {loading && (
        <p className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading this week&apos;s
          lessons...
        </p>
      )}

      {error && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-destructive text-sm">{error}</p>
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={onReload}
          >
            Try again
          </Button>
        </div>
      )}

      {empty && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No lessons this week yet.
        </p>
      )}

      {rest.length > 0 && (
        <section
          aria-label={`This week at TOPIK ${level}`}
          className="flex flex-col gap-2"
        >
          <Heading>{`This week at TOPIK ${level}`}</Heading>
          <ul className="flex flex-col gap-2">
            {rest.map((entry) => (
              <Row
                key={entry.item.key}
                item={entry.item}
                onSelect={onSelect}
                note={entry.recent ? "done recently" : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section aria-label="Other levels" className="flex flex-col gap-2">
          <Heading>Other levels</Heading>
          <ul className="flex flex-col gap-2">
            {others.map((item) => (
              <Row key={item.key} item={item} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}

      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="border-border flex min-h-16 items-center gap-3 rounded-2xl border border-dashed p-4 text-left"
        >
          <Sparkles className="text-muted-foreground size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Write your own lesson</span>
            <span className="text-muted-foreground block text-sm">
              Your model writes it from the app&apos;s prompt, and the app
              checks it. It lasts this session.
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-5 shrink-0" />
        </button>
      )}
    </div>
  )
}
