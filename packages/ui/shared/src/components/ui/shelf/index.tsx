import type { JSX } from "react"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import { Bookmark, Check, Loader2, Play, Trash2 } from "lucide-react"

import type { ShelfPort } from "../../../lib/shelf"
import type { ShelfRuntime } from "../../../lib/shelf/runtime"
import { createShelfKeeper, createShelfList } from "../../../lib/shelf/runtime"
import { cn } from "../../../lib/utils"
import { Button } from "../button"
import { AlertOrStatus, Held } from "../reserved"

/*
 * The learner shelf on screen (canon Rem. 7.3; `lib/shelf` holds the rules
 * every call follows): the kept list and "Keep on this account". An activity
 * supplies its words (`ShelfWords`) and how a kept body is read back; calls
 * and staleness are `lib/shelf/runtime`'s. Mounted only when the host passes
 * a shelf.

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
 *
 * The button keeps its place in every state, and what a keep answered
 * keeps its room below it (HS1); the full shelf's list is the one thing
 * that opens below.
 */
export const KeepOnShelf = ({
  shelf,
  words,
  shelfKey,
  body,
}: KeepOnShelfProps): JSX.Element => {
  const [keeper, keeping] = useRuntime(shelf, createShelfKeeper)
  const kept = keeping.status === "kept" ? keeping : null
  const failure = keeping.status === "failed" ? keeping.failure : null
  const replay = `Replay it from ${words.replayFrom}.`
  // Nothing a tap could do now.
  const gone = failure === "signed-out" || failure === "invalid"

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Held shown={!gone} className="grid">
        <Button
          variant="outline"
          className="min-h-11 gap-2 rounded-xl"
          disabled={keeping.status === "keeping" || kept !== null}
          onClick={() => keeper.keep(shelfKey, body)}
        >
          {keeping.status === "keeping" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : kept === null ? (
            <Bookmark className="size-4" aria-hidden="true" />
          ) : (
            <Check className="text-success size-4" aria-hidden="true" />
          )}
          {kept === null ? "Keep on this account" : "Kept"}
        </Button>
      </Held>
      <AlertOrStatus
        lines={2}
        className="text-sm"
        alertClassName={cn(
          failure !== "full" && failure !== "signed-out" && "text-destructive"
        )}
        alert={
          failure === "full"
            ? `Your shelf is full. Remove a ${words.noun} you kept, then keep this one.`
            : failure === "signed-out"
              ? "Sign in to keep this."
              : failure === "invalid"
                ? `This ${words.noun} can't be kept: the shelf refused it, most likely because it is too large.`
                : failure === "failed"
                  ? "It could not be kept. Try again."
                  : null
        }
        status={
          kept === null
            ? null
            : kept.unchanged
              ? "Already on this account."
              : kept.key === shelfKey
                ? `Kept on this account. ${replay}`
                : `Kept on this account as ${kept.key}, beside the one already named ${shelfKey}. ${replay}`
        }
      />
      {failure === "full" && <KeptShelf shelf={shelf} words={words} />}
    </div>
  )
}
