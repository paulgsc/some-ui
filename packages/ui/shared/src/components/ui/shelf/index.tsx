import type { JSX } from "react"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { Bookmark, Check, Loader2, Play, Trash2 } from "lucide-react"

import type { ShelfPort } from "../../../lib/shelf"
import type { ShelfRuntime } from "../../../lib/shelf/runtime"
import { createShelfKeeper, createShelfList } from "../../../lib/shelf/runtime"
import { Button } from "../button"

/*
 * The learner shelf on screen (canon Rem. 7.3; see `lib/shelf` for what
 * every call here is held to): the list of what the learner kept, and
 * "Keep on this account". Shared by every activity that keeps something; an
 * activity supplies its words (`ShelfWords`) and how a kept body is read
 * back. The calls and which result is stale are `lib/shelf/runtime`'s; these
 * components read its snapshot and turn taps into calls.
 *
 * Mounted only when the host passes a shelf. Every call is a tap: the list
 * loads when it is shown, and an item is kept, read or removed when the
 * learner asks for that one.
 */

/** What an activity calls the thing it keeps, in the learner's words. */
export type ShelfWords = {
  /** One kept item: "round", "lesson". */
  noun: string
  /** Where a kept item comes from: "a round you made". */
  source: string
  /** Why a kept body cannot be played: "it no longer reads as a lesson". */
  unreadable: string
  /** Where a kept item is replayed from: "Make your own". */
  replayFrom: string
}

/**
 * A runtime for `shelf`, running while this component shows it, and its
 * snapshot. Making one calls nothing, so a render may make one it then
 * throws away; only the effect starts it.
 */
function useRuntime<State, R>(
  shelf: ShelfPort,
  create: (shelf: ShelfPort) => R & ShelfRuntime<State>
): [R, State] {
  const runtime = useMemo(() => create(shelf), [shelf, create])
  useEffect(() => runtime.start(), [runtime])
  return [runtime, useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)]
}

const savedOn = (savedAt: string): string => {
  const date = new Date(savedAt)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString()
}

type KeptShelfProps<Kept> = {
  shelf: ShelfPort
  words: ShelfWords
  /**
   * How a kept item plays: `read` is the activity's own check (null when it
   * refuses the body), and `play` plays what passed it. Absent where the
   * list is only for making room (a full shelf, below): its rows can then be
   * removed and nothing else.
   */
  replay?: {
    read: (body: unknown, key: string) => Kept | null
    play: (kept: Kept) => void
  }
}

/**
 * What the learner kept, with how much room is left (`n / cap`: the shelf's
 * capacity, not progress through anything). Each row replays or is removed.
 * A row whose body fails the check says so and can only be removed.
 */
export const KeptShelf = <Kept,>({
  shelf,
  words,
  replay,
}: KeptShelfProps<Kept>): JSX.Element => {
  const [list, state] = useRuntime(shelf, createShelfList)
  const { listing, busy, unreadable, rowError } = state

  const play = (
    key: string,
    { read, play: start }: NonNullable<typeof replay>
  ): void =>
    list.replay(key, (body) => {
      const kept = read(body, key)
      if (kept === null) return false
      start(kept)
      return true
    })

  return (
    <section aria-label="Your shelf" className="flex min-w-0 flex-col gap-3">
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
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading
          your shelf…
        </p>
      )}

      {listing.status === "failed" && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            {listing.failure === "signed-out"
              ? "Sign in to see what you kept."
              : "Your shelf could not be loaded."}
          </p>
          {listing.failure === "failed" && (
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => list.retry()}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {listing.status === "ready" && listing.items.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing kept yet. Keep {words.source}, and it waits here on any device
          you sign in on.
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
                      ? `Can't be played: ${words.unreadable}.`
                      : `Kept ${savedOn(item.savedAt)}`}
                  </span>
                </div>
                {replay && !broken && (
                  <button
                    type="button"
                    aria-label={`Play ${item.key}`}
                    disabled={busy !== null}
                    onClick={() => play(item.key, replay)}
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
                  onClick={() => list.remove(item.key)}
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
          {rowError.key} could not be{" "}
          {rowError.action === "read" ? "read" : "removed"}. Try again.
        </p>
      )}
    </section>
  )
}

type KeepOnShelfProps = Omit<KeptShelfProps<never>, "replay"> & {
  /** The item's shelf key; a `-2`… variant when another item holds it. */
  shelfKey: string
  /** The item as kept, or as kept under a given key when it carries its key. */
  body: string | ((key: string) => string)
}

/**
 * "Keep on this account", for the learner's own item. A full shelf is said
 * so, with the shelf itself below to make room from; nothing is removed
 * unless the learner removes it. Key it on the item, so a new item is a new
 * question.
 */
export const KeepOnShelf = ({
  shelf,
  words,
  shelfKey,
  body,
}: KeepOnShelfProps): JSX.Element => {
  const [keeper, keeping] = useRuntime(shelf, createShelfKeeper)

  if (keeping.status === "kept") {
    const replay = `Replay it from ${words.replayFrom}.`
    return (
      <p role="status" className="flex items-center gap-2 px-1 text-sm">
        <Check className="text-success size-4" aria-hidden="true" />
        {keeping.unchanged
          ? "Already on this account."
          : keeping.key === shelfKey
            ? `Kept on this account. ${replay}`
            : `Kept on this account as ${keeping.key}, beside the one already named ${shelfKey}. ${replay}`}
      </p>
    )
  }

  const failure = keeping.status === "failed" ? keeping.failure : null

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {failure === "full" && (
        <p role="alert" className="text-sm">
          Your shelf is full. Remove a {words.noun} you kept, then keep this
          one.
        </p>
      )}
      {failure === "signed-out" && (
        <p role="alert" className="text-sm">
          Sign in to keep this.
        </p>
      )}
      {failure === "invalid" && (
        <p role="alert" className="text-destructive text-sm">
          This {words.noun} can&apos;t be kept: the shelf refused it, most
          likely because it is too large.
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
          className="min-h-11 gap-2 rounded-xl"
          disabled={keeping.status === "keeping"}
          onClick={() => keeper.keep(shelfKey, body)}
        >
          {keeping.status === "keeping" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Bookmark className="size-4" aria-hidden="true" />
          )}
          Keep on this account
        </Button>
      )}
      {failure === "full" && <KeptShelf shelf={shelf} words={words} />}
    </div>
  )
}
