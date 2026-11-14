/**
 * Takes on home (ST32): every take home keeps, newest first, each with the
 * words home heard in it, a search over those words, and Play for each, its
 * audio fetched from home. Renders `lib/library/model.ts`'s state and
 * forwards taps; its words are `lib/library/words.ts`'s.
 *
 * Where the build hands in the phone's own takes (`ports.phone`), a take
 * with no scene yet is recorded here, on the take kit's pattern
 * (`TakeList`), and listed apart, with where each is kept, until home holds
 * it (`notYetHome`).
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Input, Notice, TakeList } from "@some-ui/shared"
import { Unpaired } from "@soundbites/components/unpaired"
import type {
  LibraryIntent,
  LibraryPage,
  LibraryState,
  LibraryTake,
} from "@soundbites/lib/library/model"
import { notYetHome, takeFor } from "@soundbites/lib/library/model"
import type {
  LibraryPhone,
  LibraryPorts,
  LibraryStations,
} from "@soundbites/lib/library/runtime"
import { createTakeLibrary } from "@soundbites/lib/library/runtime"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { LoaderCircle, Pause, Play } from "lucide-react"

const WORDS = LIBRARY_WORDS

type Dispatch = (intent: LibraryIntent) => void

export type TakeLibraryProps = {
  /** Home, as the build reaches it, and a player. Read once. */
  ports: LibraryPorts
  /** The app's way to pairing, shown while this phone isn't paired (ST34). */
  pair: ReactNode
}

/** What home heard in `take`, or why there is nothing to show. */
function heardOf(take: LibraryTake): { text: string; said: boolean } {
  if (take.heard === null) return { text: WORDS.notHeard, said: false }
  const text = take.heard.text.trim()
  return text === ""
    ? { text: WORDS.silent, said: false }
    : { text, said: true }
}

const TakeItem = ({
  take,
  state,
  stations,
  dispatch,
}: {
  take: LibraryTake
  state: LibraryState
  stations: LibraryStations | undefined
  dispatch: Dispatch
}): JSX.Element => {
  const { playback } = state
  const here = playback.kind !== "quiet" && playback.id === take.id
  const heard = heardOf(take)
  const standing = stations?.standing(take) ?? null
  return (
    <li className="bg-card border-border/50 flex flex-col gap-2 rounded-2xl border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <Button
          type="button"
          size="icon"
          className="bg-brand text-brand-foreground hover:bg-brand/85 size-11 shrink-0 rounded-full"
          onClick={() => dispatch({ type: "play", id: take.id })}
          disabled={state.phone === "recording"}
          aria-label={here ? WORDS.stop : WORDS.play}
        >
          {!here ? (
            <Play className="size-4" aria-hidden="true" />
          ) : playback.kind === "loading" ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Pause className="size-4" aria-hidden="true" />
          )}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p
            className={
              heard.said
                ? "text-sm break-words"
                : "text-muted-foreground text-sm italic"
            }
          >
            {heard.text}
          </p>
          <p className="text-muted-foreground text-xs">
            {WORDS.line(takeFor(take.ref), take.recordedAt)}
          </p>
          {standing !== null && (
            <p className="text-xs font-medium">{standing}</p>
          )}
          {take.setAsideAt !== null && (
            <p className="text-muted-foreground text-xs">
              {WORDS.setAside(take.setAsideAt)}
            </p>
          )}
        </div>
      </div>
      {here && playback.kind === "loading" && <Notice>{WORDS.loading}</Notice>}
      {state.unplayable === take.id && (
        <Notice
          tone="danger"
          onDismiss={() => dispatch({ type: "noticeDismissed" })}
        >
          {WORDS.unplayable}
        </Notice>
      )}
    </li>
  )
}

const Listed = ({
  page,
  state,
  stations,
  dispatch,
}: {
  page: LibraryPage
  state: LibraryState
  stations: LibraryStations | undefined
  dispatch: Dispatch
}): JSX.Element => {
  if (page.total === 0) {
    return <p className="text-muted-foreground text-sm">{WORDS.none}</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {/* What the list below holds: the screen's own content. */}
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {WORDS.shown(
          page.by,
          state.asked,
          page.takes.length,
          page.total,
          page.matched
        )}
      </p>
      {page.takes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {page.takes.map((take) => (
            <TakeItem
              key={take.id}
              take={take}
              state={state}
              stations={stations}
              dispatch={dispatch}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

const Read = ({
  state,
  stations,
  dispatch,
  pair,
}: {
  state: LibraryState
  stations: LibraryStations | undefined
  dispatch: Dispatch
  pair: ReactNode
}): JSX.Element => {
  const { read } = state
  switch (read.kind) {
    case "reading": {
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    }
    case "read": {
      return (
        <Listed
          page={read.page}
          state={state}
          stations={stations}
          dispatch={dispatch}
        />
      )
    }
    case "unpaired": {
      return <Unpaired line={WORDS.unpaired} pair={pair} />
    }
    case "away":
    case "older":
    case "unreadable": {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{WORDS[read.kind]}</p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => dispatch({ type: "readAgain" })}
          >
            {WORDS.readAgain}
          </Button>
        </div>
      )
    }
    default: {
      return assertNever(read)
    }
  }
}

/** The phone's own takes with no scene: record one, and those home lacks. */
const PhoneTakes = ({ phone }: { phone: LibraryPhone }): JSX.Element => {
  const { takes, full } = useSyncExternalStore(
    phone.subscribe,
    phone.getSnapshot
  )
  const { playback } = useSyncExternalStore(
    phone.pattern.subscribe,
    phone.pattern.getSnapshot
  )
  const here = notYetHome(
    takes,
    playback.kind === "quiet" ? null : playback.id,
    phone.line
  )
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{WORDS.record}</h2>
      <p className="text-muted-foreground text-sm">{WORDS.recordLine}</p>
      <TakeList
        pattern={phone.pattern}
        answers={phone.line}
        takes={here}
        label={WORDS.recordLabel}
        full={
          full ? (
            <p className="text-sm">{WORDS.phoneFull(here.length)}</p>
          ) : undefined
        }
      />
    </section>
  )
}

/** Nothing to tell of, for a build that hands in no stations. */
const unsubscribed = (): (() => void) => () => undefined
const nothing = (): null => null

export const TakeLibrary = ({ ports, pair }: TakeLibraryProps): JSX.Element => {
  /* eslint-disable-next-line owner-guard/no-mount-snapshot -- the runtime is made once per mount, as Studio's screens' are */
  const [library] = useState(() => createTakeLibrary(ports))
  useEffect(() => library.attach(), [library])
  const state = useSyncExternalStore(library.subscribe, library.getSnapshot)
  const { stations } = ports
  // Renders again whenever what a row's station says may have changed.
  useSyncExternalStore(
    stations?.subscribe ?? unsubscribed,
    stations?.getSnapshot ?? nothing
  )
  const { dispatch } = library
  const searchable = state.read.kind !== "unpaired"
  return (
    <div className="flex flex-col gap-4">
      {ports.phone !== undefined && <PhoneTakes phone={ports.phone} />}
      {searchable && (
        <form
          role="search"
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({ type: "search" })
          }}
        >
          <div className="flex gap-2">
            <Input
              type="search"
              aria-label={WORDS.searchLabel}
              placeholder={WORDS.searchHint}
              value={state.draft}
              onChange={(event) =>
                dispatch({ type: "typed", text: event.target.value })
              }
            />
            <Button type="submit" variant="outline">
              {WORDS.search}
            </Button>
          </div>
          {state.tooLong && (
            <Notice role="alert" tone="warning">
              {WORDS.tooLong}
            </Notice>
          )}
          {state.asked !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => dispatch({ type: "newest" })}
            >
              {WORDS.newest}
            </Button>
          )}
        </form>
      )}
      <Read state={state} stations={stations} dispatch={dispatch} pair={pair} />
    </div>
  )
}
