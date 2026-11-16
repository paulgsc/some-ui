/**
 * Takes on home (ST32): every take home keeps, newest first, each with the
 * words home heard in it, a search over those words, and Play for each, its
 * audio fetched from home. Renders `lib/library/model.ts`'s state and
 * forwards taps; its words are `lib/library/words.ts`'s.
 *
 * In compartments (TAKES3, #3069): with no `compartment`, a tile per kind of
 * take and one for all of them, each with its count; with one, that
 * compartment's takes as cards, each saying what it was said for (TAKES2,
 * `ports.about`), under a row of chips for where a take is and its station,
 * each chip with its count (`lib/library/compartments.ts`). Chips change on
 * a tap only.
 *
 * Where the build hands in the phone's own takes (`ports.phone`), a take
 * with no scene yet is recorded in Recorded here and All, on the take
 * kit's pattern (`TakeList`), and listed apart, with where each is kept,
 * until home holds it (`notYetHome`).
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button, Dot, Input, Notice, TakeList } from "@some-ui/shared"
import type { PatternTake } from "@some-ui/voice-capture"
import { Unpaired } from "@soundbites/components/unpaired"
import type {
  Chips,
  Compartment,
  Sorted,
  TakeAbout,
  TakeKind,
  TakePlace,
} from "@soundbites/lib/library/compartments"
import {
  aboutBoth,
  aboutOfRef,
  chipCounts,
  compartmentCounts,
  inCompartment,
  NO_CHIPS,
  TAKE_KINDS,
  toggled,
  underChips,
} from "@soundbites/lib/library/compartments"
import type {
  LibraryIntent,
  LibraryPage,
  LibraryPhoneSnapshot,
  LibraryState,
  LibraryTake,
} from "@soundbites/lib/library/model"
import { notYetHome } from "@soundbites/lib/library/model"
import type {
  LibraryAbout,
  LibraryPhone,
  LibraryPorts,
  LibraryStations,
} from "@soundbites/lib/library/runtime"
import { createTakeLibrary } from "@soundbites/lib/library/runtime"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import type { LucideIcon } from "lucide-react"
import {
  CircleHelp,
  Clapperboard,
  Layers,
  Lightbulb,
  LoaderCircle,
  Mic,
  MonitorPlay,
  Pause,
  Play,
} from "lucide-react"

const WORDS = LIBRARY_WORDS

type Dispatch = (intent: LibraryIntent) => void

export type TakeLibraryProps = {
  /** Home, as the build reaches it, and a player. Read once. */
  ports: LibraryPorts
  /** The app's way to pairing, shown while this phone isn't paired (ST34). */
  pair: ReactNode
  /**
   * The compartment shown (TAKES3): its takes, under chips. Null shows the
   * tiles, one per compartment. All, when absent.
   */
  compartment?: Compartment | null | undefined
  /** The way into a compartment, around its tile; a plain tile without. */
  tile?: ((compartment: Compartment, body: ReactNode) => ReactNode) | undefined
  /**
   * What a page adds under each take of home's (Studio's conveyor page, its
   * station strip and moves, CONVEYOR2; Takes, the way to a note's
   * episode); none on the plain list.
   */
  row?: ((take: LibraryTake) => ReactNode) | undefined
}

/**
 * Each kind's mark: its shape alone. A hue on a take means where it is
 * (`Dot`), so a kind takes none.
 */
const MARKS: Readonly<Record<TakeKind, LucideIcon>> = {
  note: MonitorPlay,
  scene: Clapperboard,
  idea: Lightbulb,
  ask: CircleHelp,
  here: Mic,
}

const Mark = ({
  kind,
  className,
}: {
  kind: TakeKind | "all"
  className?: string
}): JSX.Element => {
  const Icon = kind === "all" ? Layers : MARKS[kind]
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-muted text-foreground inline-grid size-7 shrink-0 place-items-center rounded-lg",
        className
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

/** One take of home's, as the compartments sort it. */
type HomeRow = Sorted & {
  readonly take: LibraryTake
  readonly about: TakeAbout
  readonly canned: boolean
}

/** One of the phone's takes home doesn't have yet. */
type PhoneRow = Sorted & {
  readonly take: PatternTake
  readonly about: TakeAbout
}

const noPhone: LibraryPhoneSnapshot = { takes: [], full: false }
const unsubscribed = (): (() => void) => () => undefined
const nothing = (): null => null
const noPhoneSnapshot = (): LibraryPhoneSnapshot => noPhone

/** What home heard in `take`, or why there is nothing to show. */
function heardOf(take: LibraryTake): { text: string; said: boolean } {
  if (take.heard === null) return { text: WORDS.notHeard, said: false }
  const text = take.heard.text.trim()
  return text === ""
    ? { text: WORDS.silent, said: false }
    : { text, said: true }
}

/** A pill on a card: where a take is (with its dot), or its station. */
const Pill = ({
  dot,
  children,
}: {
  dot?: TakePlace | undefined
  children: ReactNode
}): JSX.Element => (
  <span className="border-border bg-background inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
    {dot !== undefined && <Dot meaning={dot} />}
    {children}
  </span>
)

/**
 * What a take was said for, as its card says it: its kind's mark and name,
 * what it was for, and when it was said, with a note's picks.
 */
const AboutTake = ({
  about,
  recordedAt,
}: {
  about: TakeAbout
  recordedAt: string
}): JSX.Element => {
  const subject = WORDS.subject(about)
  const detail = WORDS.detail(about)
  return (
    <>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
        <Mark kind={about.kind} className="size-5 rounded-md" />
        {WORDS.kinds[about.kind].one}
      </p>
      {subject !== null && (
        <p className="text-sm font-bold break-words">{subject}</p>
      )}
      <p className="text-muted-foreground text-xs">
        {[detail, WORDS.said(recordedAt)]
          .filter((part) => part !== null)
          .join(" · ")}
      </p>
      {about.kind === "note" && about.picks.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {about.picks.map((pick) => (
            <li
              key={pick}
              className="bg-muted rounded-full px-2 py-0.5 text-xs"
            >
              {pick}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const HomeCard = ({
  item: { take, about },
  state,
  stations,
  row,
  dispatch,
}: {
  item: HomeRow
  state: LibraryState
  stations: LibraryStations | undefined
  row: TakeLibraryProps["row"]
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
          <AboutTake about={about} recordedAt={take.recordedAt} />
          <p
            className={
              heard.said
                ? "text-sm break-words italic"
                : "text-muted-foreground text-sm italic"
            }
          >
            {heard.said ? `“${heard.text}”` : heard.text}
          </p>
          {/* Where it stands. TAKES4's "Filed as #n" joins these pills. */}
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Pill dot="home">{WORDS.onHomeSince(take.storedAt)}</Pill>
            {standing !== null && <Pill>{standing}</Pill>}
            {/* A take on the conveyor says Canned there; set aside is said
                only of one on none (C423). */}
            {standing === null && take.setAsideAt !== null && (
              <Pill>{WORDS.setAside(take.setAsideAt)}</Pill>
            )}
          </div>
        </div>
      </div>
      {row?.(take)}
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

/**
 * A take of the phone's home doesn't have yet, in a compartment with no
 * recorder (a note's spoken part, said while home was out of reach): what
 * it was for and where it is. It plays from All.
 */
const PhoneCard = ({
  item: { take, about },
}: {
  item: PhoneRow
}): JSX.Element => (
  <li className="bg-card border-border/50 flex flex-col gap-1 rounded-2xl border p-3">
    <AboutTake about={about} recordedAt={take.recordedAt} />
    <div className="mt-1 flex flex-wrap gap-1.5">
      <Pill dot="phone">{WORDS.place.phone}</Pill>
    </div>
  </li>
)

const Listed = ({
  page,
  rows,
  others,
  compartment,
  chips,
  state,
  stations,
  row,
  dispatch,
}: {
  page: LibraryPage
  /** Home's takes in the compartment, under the chips picked. */
  rows: ReadonlyArray<HomeRow>
  /** How many of the phone's takes show above it. */
  others: number
  compartment: Compartment
  chips: Chips
  state: LibraryState
  stations: LibraryStations | undefined
  row: TakeLibraryProps["row"]
  dispatch: Dispatch
}): JSX.Element => {
  if (page.total === 0) {
    return <p className="text-muted-foreground text-sm">{WORDS.none}</p>
  }
  const card = (each: HomeRow): JSX.Element => (
    <HomeCard
      key={each.take.id}
      item={each}
      state={state}
      stations={stations}
      row={row}
      dispatch={dispatch}
    />
  )
  // With no station picked, the canned fold under the rest (C424).
  const fold = chips.station === null
  const live = fold ? rows.filter((each) => !each.canned) : rows
  const canned = fold ? rows.filter((each) => each.canned) : []
  const shelf = canned[0]?.station ?? null
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
      {rows.length === 0 && others === 0 && page.takes.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {chips.place === null && chips.station === null
            ? WORDS.empty(compartment)
            : WORDS.noneUnder}
        </p>
      )}
      {live.length > 0 && (
        <ul className="flex flex-col gap-2">{live.map(card)}</ul>
      )}
      {shelf !== null && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground flex justify-between text-xs font-bold tracking-wide uppercase">
            <span>{shelf}</span>
            <span>{canned.length}</span>
          </h2>
          <ul className="flex flex-col gap-2">{canned.map(card)}</ul>
        </section>
      )}
    </div>
  )
}

/** What a read of home came to, when it didn't list takes. */
const Unread = ({
  state,
  dispatch,
  pair,
}: {
  state: LibraryState
  dispatch: Dispatch
  pair: ReactNode
}): JSX.Element | null => {
  const { read } = state
  switch (read.kind) {
    case "reading": {
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    }
    case "read": {
      return null
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

/**
 * The phone's own takes with no scene: record one, and those home lacks
 * that `shows` keeps.
 */
const PhoneTakes = ({
  phone,
  shows,
}: {
  phone: LibraryPhone
  shows: (take: PatternTake) => boolean
}): JSX.Element => {
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
  ).filter(shows)
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

/** One compartment's tile: its mark, count, name and what goes there. */
const TileBody = ({
  compartment,
  count,
}: {
  compartment: Compartment
  count: number
}): JSX.Element => (
  <span className="flex flex-col gap-1.5">
    <span className="flex items-center justify-between gap-2">
      <Mark kind={compartment} />
      <span
        className={cn(
          "text-2xl leading-none font-bold tabular-nums",
          count === 0 && "text-muted-foreground"
        )}
      >
        {count}
      </span>
    </span>
    <span className="text-sm font-bold">
      {WORDS.compartmentHeading(compartment)}
    </span>
    <span className="text-muted-foreground text-xs">
      {compartment === "all" ? WORDS.allLine : WORDS.kinds[compartment].line}
    </span>
  </span>
)

const TILE = "bg-card border-border/50 flex rounded-2xl border p-3 text-left"

/** Takes' first page (TAKES3): a tile per kind, then all of them. */
const Tiles = ({
  counts,
  tile,
}: {
  counts: Readonly<Record<Compartment, number>>
  tile: TakeLibraryProps["tile"]
}): JSX.Element => {
  const one = (compartment: Compartment): JSX.Element => {
    const body = (
      <TileBody compartment={compartment} count={counts[compartment]} />
    )
    return tile === undefined ? (
      <div className={cn(TILE, "w-full")}>{body}</div>
    ) : (
      <>{tile(compartment, body)}</>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3">
        {TAKE_KINDS.map((kind) => (
          <li key={kind} className="flex">
            {one(kind)}
          </li>
        ))}
      </ul>
      {/* All, the width of the row below the kinds. */}
      {one("all")}
    </div>
  )
}

/** A chip: what it shows, its count, and whether it is picked. */
const Chip = ({
  picked,
  count,
  dot,
  onTap,
  children,
}: {
  picked: boolean
  count: number
  dot: TakePlace | null
  onTap: () => void
  children: ReactNode
}): JSX.Element => (
  <button
    type="button"
    aria-pressed={picked}
    onClick={onTap}
    className={cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm",
      picked ? "bg-foreground text-background" : "bg-card"
    )}
  >
    {dot !== null && <Dot meaning={dot} className="size-2" />}
    {children}
    <span className="tabular-nums opacity-75">{count}</span>
  </button>
)

/**
 * The chips in the top bar (TAKES3): where a take is, then its station,
 * each with how many takes tapping it shows.
 */
const ChipBar = ({
  places,
  stations,
  chips,
  onChips,
}: {
  places: ReturnType<typeof chipCounts>["places"]
  stations: ReturnType<typeof chipCounts>["stations"]
  chips: Chips
  onChips: (chips: Chips) => void
}): JSX.Element | null => {
  // A lone chip, not picked, would filter nothing (the conveyor's page).
  const picked = chips.place !== null || chips.station !== null
  if (places.length + stations.length < 2 && !picked) return null
  return (
    <nav
      aria-label={WORDS.chips}
      className="bg-background sticky top-0 z-10 flex gap-2 overflow-x-auto py-1"
    >
      {places.map(({ chip, count }) => (
        <Chip
          key={chip}
          picked={chips.place === chip}
          count={count}
          dot={chip}
          onTap={() => onChips(toggled(chips, { group: "place", value: chip }))}
        >
          {WORDS.place[chip]}
        </Chip>
      ))}
      {stations.map(({ chip, count }) => (
        <Chip
          key={chip}
          picked={chips.station === chip}
          count={count}
          dot={null}
          onTap={() =>
            onChips(toggled(chips, { group: "station", value: chip }))
          }
        >
          {chip}
        </Chip>
      ))}
    </nav>
  )
}

/** What a take was said for: the build's word, else its ref's. */
const aboutWith =
  (about: LibraryAbout | undefined) =>
  (id: string, ref: string | null): TakeAbout =>
    aboutBoth(
      ref === null ? { kind: "here" } : aboutOfRef(ref),
      about?.about(id, ref) ?? null
    )

/** Whether the phone's recorder belongs in `compartment`. */
const records = (compartment: Compartment): boolean =>
  compartment === "here" || compartment === "all"

export const TakeLibrary = ({
  ports,
  pair,
  compartment = "all",
  tile,
  row,
}: TakeLibraryProps): JSX.Element => {
  /* eslint-disable-next-line owner-guard/no-mount-snapshot -- the runtime is made once per mount, as Studio's screens' are */
  const [library] = useState(() => createTakeLibrary(ports))
  useEffect(() => library.attach(), [library])
  const state = useSyncExternalStore(library.subscribe, library.getSnapshot)
  const [chips, setChips] = useState<Chips>(NO_CHIPS)
  const { stations, phone, about } = ports
  // Renders again whenever what a row's station or kind says may have changed.
  useSyncExternalStore(
    stations?.subscribe ?? unsubscribed,
    stations?.getSnapshot ?? nothing
  )
  useSyncExternalStore(
    about?.subscribe ?? unsubscribed,
    about?.getSnapshot ?? nothing
  )
  const phoneTakes = useSyncExternalStore(
    phone?.subscribe ?? unsubscribed,
    phone?.getSnapshot ?? noPhoneSnapshot
  ).takes
  const { dispatch } = library
  const aboutOf = aboutWith(about)
  const page = state.read.kind === "read" ? state.read.page : null
  const homeRows: ReadonlyArray<HomeRow> = (page?.takes ?? []).map((take) => {
    const at = stations?.station(take) ?? null
    const said = aboutOf(take.id, take.ref)
    return {
      take,
      about: said,
      kind: said.kind,
      place: "home",
      station: at?.name ?? null,
      canned: at?.canned ?? false,
    }
  })
  const onHome = new Set(homeRows.map(({ take }) => take.id))
  const phoneRows: ReadonlyArray<PhoneRow> = notYetHome(
    phoneTakes,
    null,
    phone?.line ?? ""
  )
    .filter((take) => !onHome.has(take.id))
    .map((take) => {
      const said = aboutOf(take.id, null)
      return {
        take,
        about: said,
        kind: said.kind,
        place: "phone",
        station: null,
      }
    })
  const sorted: ReadonlyArray<Sorted> = [...phoneRows, ...homeRows]

  if (compartment === null) {
    const listed = page?.takes.length ?? 0
    return (
      <div className="flex flex-col gap-4">
        <Unread state={state} dispatch={dispatch} pair={pair} />
        {page !== null && listed < page.total && (
          <p className="text-muted-foreground text-sm">
            {WORDS.counted(listed, page.total)}
          </p>
        )}
        <Tiles counts={compartmentCounts(sorted)} tile={tile} />
      </div>
    )
  }

  const counts = chipCounts(sorted, compartment, chips, stations?.names ?? [])
  const shows = (each: Sorted): boolean =>
    inCompartment(each, compartment) && underChips(each, chips)
  const phoneShown = phoneRows.filter(shows)
  const recorder =
    phone !== undefined &&
    records(compartment) &&
    chips.place !== "home" &&
    chips.station === null
  const searchable = state.read.kind !== "unpaired"
  return (
    <div className="flex flex-col gap-4">
      <ChipBar
        places={counts.places}
        stations={counts.stations}
        chips={chips}
        onChips={setChips}
      />
      {recorder && (
        <PhoneTakes
          phone={phone}
          shows={(take) => inCompartment(aboutOf(take.id, null), compartment)}
        />
      )}
      {!recorder && phoneShown.length === 0 && chips.place === "phone" && (
        <p className="text-muted-foreground text-sm">{WORDS.noneUnder}</p>
      )}
      {!recorder && phoneShown.length > 0 && (
        <ul className="flex flex-col gap-2">
          {phoneShown.map((each) => (
            <PhoneCard key={each.take.id} item={each} />
          ))}
        </ul>
      )}
      {searchable && chips.place !== "phone" && (
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
      <Unread state={state} dispatch={dispatch} pair={pair} />
      {page !== null && chips.place !== "phone" && (
        <Listed
          page={page}
          rows={homeRows.filter(shows)}
          others={phoneShown.length}
          compartment={compartment}
          chips={chips}
          state={state}
          stations={stations}
          row={row}
          dispatch={dispatch}
        />
      )}
    </div>
  )
}
