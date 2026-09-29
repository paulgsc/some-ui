import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import type {
  ShelfFailure,
  ShelfItem,
  ShelfPort,
} from "@leetype/lib/leetype/shelf"
import {
  keepWithoutReplacing,
  keptRoundOf,
  shelfFailureOf,
} from "@leetype/lib/leetype/shelf"
import type { Round } from "@leetype/types/authored-round"
import { Button } from "@some-ui/shared"
import { Bookmark, Check, Loader2, Play, Trash2 } from "lucide-react"

/*
 * The learner shelf in a round session: keeping the learner's own round on
 * their account, and the list of rounds they kept (canon Rem. 7.3; see
 * `lib/leetype/shelf` for what every call here is held to).
 *
 * Mounted only when the host passes a shelf. Every call is a tap: the list
 * loads when it is shown, and a round is kept, read or removed when the
 * learner asks for that one.
 */

type Listing =
  | { status: "loading" }
  | { status: "ready"; items: Array<ShelfItem>; cap: number }
  | { status: "failed"; failure: ShelfFailure }

const savedOn = (savedAt: string): string => {
  const date = new Date(savedAt)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString()
}

type RoundShelfProps = {
  shelf: ShelfPort
  /**
   * Plays a kept round that passed the paste's own check. Absent where the
   * list is only for making room (a full shelf, below): its rows can then
   * be removed and nothing else.
   */
  onReplay?: (round: Round) => void
}

/**
 * What the learner kept, with how much room is left (`n / cap`: the
 * shelf's capacity, not progress through anything; Prop. 8.1 is about
 * rounds, and this counts none). Each row replays or is removed. A row whose
 * body fails the check says so and can only be removed.
 */
export const RoundShelf: FC<RoundShelfProps> = ({ shelf, onReplay }) => {
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

  const replay = (key: string, play: (round: Round) => void): void => {
    setBusy(key)
    setRowError(null)
    shelf
      .read(key)
      .then(
        (body) => {
          if (!mounted.current) return
          const round = keptRoundOf(body)
          if (round) play(round)
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
    <section aria-label="Your shelf" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your shelf
        </h2>
        {listing.status === "ready" && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {listing.items.length} / {listing.cap}
          </span>
        )}
      </div>

      {listing.status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading
          your shelf…
        </p>
      )}

      {listing.status === "failed" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {listing.failure === "signed-out"
              ? "Sign in to see what you kept."
              : "Your shelf could not be loaded."}
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
        <p className="text-sm text-muted-foreground">
          Nothing kept yet. Keep a round you made, and it waits here on any
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
                className="flex min-h-14 items-stretch rounded-2xl border border-border bg-card"
              >
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-2">
                  <span className="truncate font-semibold">{item.key}</span>
                  <span
                    className={
                      broken
                        ? "text-xs text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {broken
                      ? "Can't be played: it no longer passes the round checks."
                      : `Kept ${savedOn(item.savedAt)}`}
                  </span>
                </div>
                {onReplay && !broken && (
                  <button
                    type="button"
                    aria-label={`Play ${item.key}`}
                    disabled={busy !== null}
                    onClick={() => replay(item.key, onReplay)}
                    className="flex w-12 shrink-0 items-center justify-center text-primary disabled:opacity-50"
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
                  className="flex w-12 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {rowError && (
        <p role="alert" className="text-sm text-destructive">
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

type KeepRoundProps = {
  shelf: ShelfPort
  /** The round's shelf key (`shelfKeyOf`); a `-2`… variant when another round holds it. */
  shelfKey: string
  /** The round as `serializeRound` writes it. */
  body: string
}

/**
 * "Keep on this account", for the learner's own round. The one caller of
 * `ShelfPort.keep`. A full shelf is said so, with the shelf itself below to
 * make room from; nothing is removed unless the learner removes it.
 */
export const KeepRound: FC<KeepRoundProps> = ({ shelf, shelfKey, body }) => {
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
        <Check className="size-4 text-emerald-400" aria-hidden="true" />
        {keeping.unchanged
          ? "Already on this account."
          : keeping.key === shelfKey
            ? "Kept on this account. Replay it from Make your own."
            : `Kept on this account as ${keeping.key}, beside the one already named ${shelfKey}. Replay it from Make your own.`}
      </p>
    )
  }

  const failure = keeping.status === "failed" ? keeping.failure : null

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {failure === "full" && (
        <p role="alert" className="text-sm">
          Your shelf is full. Remove a round you kept, then keep this one.
        </p>
      )}
      {failure === "signed-out" && (
        <p role="alert" className="text-sm">
          Sign in to keep this.
        </p>
      )}
      {failure === "invalid" && (
        <p role="alert" className="text-sm text-destructive">
          This round can&apos;t be kept: the shelf refused it, most likely
          because it is too large.
        </p>
      )}
      {failure === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          It could not be kept. Try again.
        </p>
      )}
      {failure !== "signed-out" && failure !== "invalid" && (
        <Button
          variant="outline"
          className="min-h-11 gap-2 rounded-xl"
          disabled={keeping.status === "keeping"}
          onClick={keep}
        >
          {keeping.status === "keeping" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Bookmark className="size-4" aria-hidden="true" />
          )}
          Keep on this account
        </Button>
      )}
      {failure === "full" && <RoundShelf shelf={shelf} />}
    </div>
  )
}
