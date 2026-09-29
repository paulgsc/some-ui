/**
 * The learner shelf on a phone: keeping the pasted lesson on the learner's
 * account, and the list of what they kept (canon Rem. 7.3; see
 * `adapter/shelf` for what every call here is held to).
 *
 * Mounted only when the host passes a shelf. Every call is a tap: the list
 * loads when it is shown, and a lesson is kept, read or removed when the
 * learner asks for that one.
 */

import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@some-ui/shared"
import type { PastedLesson } from "@topik/lib/topik/adapter/pasted-lesson"
import type {
  ShelfFailure,
  ShelfItem,
  ShelfPort,
} from "@topik/lib/topik/adapter/shelf"
import {
  keepWithoutReplacing,
  keptLessonOf,
  shelfFailureOf,
} from "@topik/lib/topik/adapter/shelf"
import { Bookmark, Check, Loader2, Play, Trash2 } from "lucide-react"

type Listing =
  | { status: "loading" }
  | { status: "ready"; items: Array<ShelfItem>; cap: number }
  | { status: "failed"; failure: ShelfFailure }

const FAILURE_TEXT: Record<ShelfFailure, string> = {
  full: "Your shelf is full.",
  "signed-out": "Sign in to see what you kept.",
  // A listing is never "invalid" (that is a refused keep); said plainly if so.
  invalid: "Your shelf could not be loaded.",
  failed: "Your shelf could not be loaded.",
}

const savedOn = (savedAt: string): string => {
  const date = new Date(savedAt)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString()
}

type LessonShelfProps = {
  shelf: ShelfPort
  /**
   * Plays a kept lesson that passed the paste's own check. Absent where the
   * list is only for making room (a full shelf, below): its rows can then
   * be removed and nothing else.
   */
  onReplay?: (lesson: PastedLesson) => void
}

/**
 * What the learner kept, with how much room is left (`n / cap`: a
 * capacity, not progress). Each row replays or is removed. A row whose body
 * fails the check says so and can only be removed.
 */
export const LessonShelf = ({
  shelf,
  onReplay,
}: LessonShelfProps): JSX.Element => {
  const [listing, setListing] = useState<Listing>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState<ReadonlySet<string>>(new Set())
  const [rowError, setRowError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    shelf.list().then(
      ({ items, cap }) => {
        if (live) setListing({ status: "ready", items, cap })
      },
      (error: unknown) => {
        if (live)
          setListing({ status: "failed", failure: shelfFailureOf(error) })
      }
    )
    return (): void => {
      live = false
    }
  }, [shelf, attempt])

  const retry = (): void => {
    setListing({ status: "loading" })
    setAttempt((count) => count + 1)
  }

  // A replay the learner walked away from must not start playing when its
  // read resolves (review, #1600).
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return (): void => {
      mounted.current = false
    }
  }, [])

  const replay = (key: string, play: (lesson: PastedLesson) => void): void => {
    setBusy(key)
    setRowError(null)
    shelf
      .read(key)
      .then(
        (body) => {
          if (!mounted.current) return
          const lesson = keptLessonOf(body, key)
          if (lesson) play(lesson)
          else setUnreadable((keys) => new Set(keys).add(key))
        },
        () => setRowError(`${key} could not be read. Try again.`)
      )
      .finally(() => setBusy(null))
  }

  const remove = (key: string): void => {
    setBusy(key)
    setRowError(null)
    shelf
      .remove(key)
      .then(
        () =>
          setListing((current) =>
            current.status === "ready"
              ? {
                  ...current,
                  items: current.items.filter((item) => item.key !== key),
                }
              : current
          ),
        () => setRowError(`${key} could not be removed. Try again.`)
      )
      .finally(() => setBusy(null))
  }

  return (
    <section aria-label="Your shelf" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Your shelf
        </h2>
        {listing.status === "ready" && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {listing.items.length} / {listing.cap}
          </span>
        )}
      </div>

      {listing.status === "loading" && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading your shelf...
        </p>
      )}

      {listing.status === "failed" && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            {FAILURE_TEXT[listing.failure]}
          </p>
          {listing.failure === "failed" && (
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={retry}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {listing.status === "ready" && listing.items.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing kept yet. Keep a lesson you pasted, and it waits here on any
          device you sign in on.
        </p>
      )}

      {listing.status === "ready" && listing.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {listing.items.map((item) => {
            const broken = unreadable.has(item.key)
            const working = busy === item.key
            return (
              <li
                key={item.key}
                className="bg-card border-border flex min-h-14 items-stretch rounded-2xl border"
              >
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-2">
                  <span className="truncate font-semibold">{item.key}</span>
                  <span
                    className={
                      broken
                        ? "text-destructive text-xs"
                        : "text-muted-foreground text-xs"
                    }
                  >
                    {broken
                      ? "Can't be played: it no longer reads as a lesson."
                      : `Kept ${savedOn(item.savedAt)}`}
                  </span>
                </div>
                {onReplay && !broken && (
                  <button
                    type="button"
                    aria-label={`Play ${item.key}`}
                    disabled={busy !== null}
                    onClick={() => replay(item.key, onReplay)}
                    className="text-primary flex w-12 shrink-0 items-center justify-center disabled:opacity-50"
                  >
                    {working ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${item.key}`}
                  disabled={busy !== null}
                  onClick={() => remove(item.key)}
                  className="text-muted-foreground flex w-12 shrink-0 items-center justify-center disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {rowError && (
        <p role="alert" className="text-destructive text-sm">
          {rowError}
        </p>
      )}
    </section>
  )
}

type Keeping =
  | { status: "idle" }
  | { status: "keeping" }
  | { status: "kept"; unchanged: boolean; key: string }
  | { status: "failed"; failure: ShelfFailure }

type KeepLessonProps = {
  shelf: ShelfPort
  /** The pasted lesson's shelf key (`shelfKeyOf`); a `-2`… variant when another lesson holds it. */
  shelfKey: string
  /** The pasted slot's document (`serializePastedLesson`). */
  body: string
}

/**
 * "Keep on this account", for the lesson in the pasted slot. The one caller
 * of `ShelfPort.keep`. A full shelf is said so, with the shelf itself below
 * to make room from; nothing is removed unless the learner removes it.
 */
export const KeepLesson = ({
  shelf,
  shelfKey,
  body,
}: KeepLessonProps): JSX.Element => {
  const [keeping, setKeeping] = useState<Keeping>({ status: "idle" })

  const keep = (): void => {
    setKeeping({ status: "keeping" })
    keepWithoutReplacing(shelf, shelfKey, body).then(
      ({ change, key }) =>
        setKeeping({ status: "kept", unchanged: change === "unchanged", key }),
      (error: unknown) =>
        setKeeping({ status: "failed", failure: shelfFailureOf(error) })
    )
  }

  if (keeping.status === "kept") {
    return (
      <p role="status" className="flex items-center gap-2 px-1 text-sm">
        <Check className="text-success size-4" />
        {keeping.unchanged
          ? "Already on this account."
          : keeping.key === shelfKey
            ? "Kept on this account. Replay it from Write your own lesson."
            : `Kept on this account as ${keeping.key}, beside the one already named ${shelfKey}. Replay it from Write your own lesson.`}
      </p>
    )
  }

  const failure = keeping.status === "failed" ? keeping.failure : null

  return (
    <div className="flex flex-col gap-2">
      {failure === "full" && (
        <p role="alert" className="text-sm">
          Your shelf is full. Remove a lesson you kept, then keep this one.
        </p>
      )}
      {failure === "signed-out" && (
        <p role="alert" className="text-sm">
          Sign in to keep this.
        </p>
      )}
      {failure === "invalid" && (
        <p role="alert" className="text-destructive text-sm">
          This lesson can&apos;t be kept: the shelf refused it, most likely
          because it is too large.
        </p>
      )}
      {failure === "failed" && (
        <p role="alert" className="text-destructive text-sm">
          It could not be kept. Try again.
        </p>
      )}
      {failure !== "signed-out" && failure !== "invalid" && (
        <Button
          variant="outline"
          className="h-11 gap-2 rounded-xl"
          disabled={keeping.status === "keeping"}
          onClick={keep}
        >
          {keeping.status === "keeping" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Bookmark className="size-4" />
          )}
          Keep on this account
        </Button>
      )}
      {failure === "full" && <LessonShelf shelf={shelf} />}
    </div>
  )
}
