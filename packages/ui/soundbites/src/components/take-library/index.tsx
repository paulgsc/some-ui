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
import {
  Button,
  Chip,
  CHIP_BAR,
  Dot,
  Input,
  Notice,
  Reading,
  TakeList,
} from "@some-ui/shared"
import type { PatternTake } from "@some-ui/voice-capture"
import {
  HearAgainButton,
  HearAgainLines,
} from "@soundbites/components/hear-again"
import { Unpaired } from "@soundbites/components/unpaired"
import type {
  ChipGroups,
  ChipPick,
  Chips,
  Compartment,
  Order,
  Sorted,
  TakeAbout,
  TakeKind,
  TakePlace,
  TakeStatus,
} from "@soundbites/lib/library/compartments"
import {
  aboutBoth,
  aboutOfRef,
  anyPicked,
  chipCounts,
  compartmentCounts,
  holdsWords,
  inCompartment,
  kindsAsked,
  NO_CHIPS,
  ordered,
  ORDERS,
  STUDIO_KINDS,
  TAKE_KINDS,
  toggled,
  topicOf,
  underChips,
  withGaps,
} from "@soundbites/lib/library/compartments"
import type { TakeNames, TakeOf } from "@soundbites/lib/library/kinds"
import { NO_NAMES, portAbout } from "@soundbites/lib/library/kinds"
import type {
  LibraryIntent,
  LibraryPage,
  LibraryPhoneSnapshot,
  LibraryQuery,
  LibraryState,
  LibraryTake,
} from "@soundbites/lib/library/model"
import { notYetHome } from "@soundbites/lib/library/model"
import type {
  LibraryAbout,
  LibraryPhone,
  LibraryPorts,
  LibraryStations,
  PhoneTake,
} from "@soundbites/lib/library/runtime"
import { createTakeLibrary } from "@soundbites/lib/library/runtime"
import { ABOUT_WORDS, LIBRARY_WORDS } from "@soundbites/lib/library/words"
import type { LucideIcon } from "lucide-react"
import {
  AudioLines,
  BriefcaseBusiness,
  CircleHelp,
  Clapperboard,
  Cog,
  Drama,
  Glasses,
  Keyboard,
  Layers,
  Lightbulb,
  MessagesSquare,
  Mic,
  MicVocal,
  MonitorPlay,
  NotebookPen,
  Shapes,
  ShoppingBasket,
  Trophy,
} from "lucide-react"

import { PlayButton } from "./parts"

const WORDS = LIBRARY_WORDS

type Dispatch = (intent: LibraryIntent) => void

/**
 * What uses each take (INUSE): the build's own mark for a take something
 * uses, which opens what uses it, from the stores the phone keeps, drawn
 * again on each change it tells of. A take it draws nothing for is one it
 * knows no use of, never one it calls unused.
 */
export type LibraryUses = {
  readonly subscribe: (listener: () => void) => () => void
  /** Changes whenever what `mark` draws may have. */
  readonly getSnapshot: () => unknown
  /** Take `id`'s mark; null for none. */
  readonly mark: (id: string) => ReactNode
}

export type TakeLibraryProps = {
  /** What uses each take, as the build marks it (INUSE); absent, none. */
  uses?: LibraryUses | undefined
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
  /**
   * The chips picked when the page opens: a wing's own view is
   * this home filtered, as Game day's way to a game's takes is. Read once.
   */
  initialChips?: Partial<Chips> | undefined
  /**
   * What the topic picked holds that no take is about, each placed among
   * the takes by when it was (`withGaps`): a game's big moments with no bite
   * (GWB14 D15), later a week's questions not answered. Asked only while a
   * topic is the one chip picked and nothing is searched, with home's takes
   * about it; none without.
   */
  gaps?:
    | ((
        topicKey: string,
        takes: ReadonlyArray<LibraryTake>
      ) => ReadonlyArray<TopicGap>)
    | undefined
}

/** One thing a topic holds with no take: its key, when it was, its row. */
export type TopicGap = {
  readonly key: string
  /** ISO-8601, as a take's `recordedAt` is. */
  readonly at: string
  readonly body: ReactNode
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
  spoken: MicVocal,
  here: Mic,
  bite: Trophy,
  round: Cog,
  interview: MessagesSquare,
  hunch: ShoppingBasket,
  reflection: NotebookPen,
  jobs: BriefcaseBusiness,
  drama: Drama,
  soundbite: AudioLines,
  lens: Glasses,
  leetype: Keyboard,
  other: Shapes,
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

/** One of the phone's takes of another kind that home doesn't list. */
type OwnRow = Sorted & {
  readonly own: PhoneTake
  readonly about: TakeAbout
}

const noOwn: ReadonlyArray<PhoneTake> = []
const noOwnSnapshot = (): ReadonlyArray<PhoneTake> => noOwn

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
  item,
  state,
  stations,
  mark,
  row,
  dispatch,
}: {
  item: HomeRow
  state: LibraryState
  stations: LibraryStations | undefined
  /** The build's mark for what uses it (INUSE); null for none. */
  mark: ReactNode
  row: TakeLibraryProps["row"]
  dispatch: Dispatch
}): JSX.Element => {
  const { take, about } = item
  const { playback } = state
  const here = playback.kind !== "quiet" && playback.id === take.id
  const heard = heardOf(take)
  const standing = stations?.standing(take) ?? null
  const gone =
    item.status === "deleted" || item.status === "let-go" ? item.status : null
  return (
    <li className="bg-card border-border/50 flex flex-col gap-2 rounded-2xl border p-3">
      <div className="flex min-w-0 items-start gap-3">
        {gone === null && (
          <PlayButton
            playing={here}
            loading={playback.kind === "loading"}
            disabled={state.phone === "recording"}
            onPress={() => dispatch({ type: "play", id: take.id })}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <AboutTake about={about} recordedAt={take.recordedAt} />
          {gone !== null && (
            <p className="text-muted-foreground text-sm">
              {WORDS.letGone(gone)}
            </p>
          )}
          {gone !== "deleted" && (
            <p
              className={
                heard.said
                  ? "text-sm break-words italic"
                  : "text-muted-foreground text-sm italic"
              }
            >
              {heard.said ? `“${heard.text}”` : heard.text}
            </p>
          )}
          {/* Where it stands. TAKES4's "Filed as #n" joins these pills. */}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {gone !== "deleted" && (
              <Pill dot="home">{WORDS.onHomeSince(take.storedAt)}</Pill>
            )}
            {standing !== null && <Pill>{standing}</Pill>}
            {gone !== "deleted" && mark}
            {/* A take on the conveyor says Canned there; set aside is said
                only of one on none (C423). */}
            {standing === null && take.setAsideAt !== null && (
              <Pill>{WORDS.setAside(take.setAsideAt)}</Pill>
            )}
          </div>
        </div>
      </div>
      {gone === null && (
        <>
          <HearAgainButton
            take={take}
            state={state}
            onAsk={() => dispatch({ type: "hearAgain", id: take.id })}
          />
          <HearAgainLines
            take={take}
            state={state}
            onDismiss={() => dispatch({ type: "hearAgainDismissed" })}
          />
        </>
      )}
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

/**
 * One of the phone's takes of another kind that home doesn't list yet:
 * what it is about, that it is on this phone alone, and Play,
 * from the phone.
 */
const OwnCard = ({
  item: { own, about },
  covers,
  state,
  dispatch,
}: {
  item: OwnRow
  /** What home's list covers, for what a take home holds says. */
  covers: LibraryPage["covers"]
  state: LibraryState
  dispatch: Dispatch
}): JSX.Element => {
  const { playback } = state
  const here = playback.kind !== "quiet" && playback.id === own.id
  return (
    <li className="bg-card border-border/50 flex flex-col gap-2 rounded-2xl border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <PlayButton
          playing={here}
          loading={playback.kind === "loading"}
          disabled={state.phone === "recording"}
          onPress={() => dispatch({ type: "play", id: own.id })}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <AboutTake about={about} recordedAt={own.recordedAt} />
          <p className="text-muted-foreground text-sm italic">
            {own.home !== true
              ? WORDS.waitsHere
              : covers === "every"
                ? WORDS.homeHasIt
                : WORDS.homeLater}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {own.home === true ? (
              <Pill dot="home">{WORDS.place.home}</Pill>
            ) : (
              <Pill dot="phone">{WORDS.place.phone}</Pill>
            )}
          </div>
        </div>
      </div>
      {state.unplayable === own.id && (
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

const NO_GAPS: ReadonlyArray<TopicGap> = []

/** When a take was said. */
const at = (each: HomeRow | OwnRow): string =>
  "own" in each ? each.own.recordedAt : each.take.recordedAt

const Listed = ({
  page,
  rows,
  gaps,
  others,
  compartment,
  chips,
  order,
  state,
  stations,
  uses,
  row,
  dispatch,
}: {
  order: Order
  /** Home's answer; null while there is none, so only the phone's show. */
  page: LibraryPage | null
  /** The takes in the compartment, under the chips picked, in order. */
  rows: ReadonlyArray<HomeRow | OwnRow>
  /** What the topic picked holds with no take, by when each was. */
  gaps: ReadonlyArray<TopicGap>
  /** How many of the phone's takes show above it. */
  others: number
  compartment: Compartment
  chips: Chips
  state: LibraryState
  stations: LibraryStations | undefined
  uses: LibraryUses | undefined
  row: TakeLibraryProps["row"]
  dispatch: Dispatch
}): JSX.Element | null => {
  if (page !== null && page.total === 0 && rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{WORDS.none}</p>
  }
  const card = (each: HomeRow | OwnRow): JSX.Element =>
    "own" in each ? (
      <OwnCard
        key={each.own.id}
        item={each}
        covers={page?.covers}
        state={state}
        dispatch={dispatch}
      />
    ) : (
      <HomeCard
        key={each.take.id}
        item={each}
        state={state}
        stations={stations}
        mark={uses?.mark(each.take.id) ?? null}
        row={row}
        dispatch={dispatch}
      />
    )
  const isCanned = (each: HomeRow | OwnRow): boolean =>
    !("own" in each) && each.canned
  // With no station picked, the canned fold under the rest (C424).
  const fold = chips.station === null
  const live = fold ? rows.filter((each) => !isCanned(each)) : rows
  const canned = fold ? rows.filter(isCanned) : []
  const shelf = canned[0]?.station ?? null
  // Home has every take to list once no older page is left to show.
  const listedAll = page !== null && (page.next ?? null) === null
  const liveListed = withGaps(live, gaps, order, at, listedAll)
  return (
    <div className="flex flex-col gap-3">
      {/* What the list below holds: the screen's own content. */}
      {page !== null && (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {WORDS.shown(
            page.by,
            state.asked,
            page.takes.length,
            page.total,
            page.matched,
            order,
            STUDIO_KINDS.some((kind) => kind === compartment)
          )}
        </p>
      )}
      {page?.covers === "studio" && (
        <p className="text-muted-foreground text-sm">{WORDS.studioOnly}</p>
      )}
      {page !== null && (page.next ?? null) !== null && (
        <p className="text-muted-foreground text-sm">
          {WORDS.countedSoFar(page.takes.length, page.total)}
        </p>
      )}
      {rows.length === 0 &&
        others === 0 &&
        (page === null ? chips.place === "phone" : page.takes.length > 0) && (
          <p className="text-muted-foreground text-sm">
            {anyPicked(chips) ? WORDS.noneUnder : WORDS.empty(compartment)}
          </p>
        )}
      {liveListed.length > 0 && (
        <ul className="flex flex-col gap-2">
          {liveListed.map((each) =>
            each.kind === "take" ? (
              card(each.row)
            ) : (
              <li key={`gap:${each.gap.key}`}>{each.gap.body}</li>
            )
          )}
        </ul>
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
      {/* Last, so nothing above moves when it is pressed (HS1). */}
      {(page?.next ?? null) !== null && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={state.older === "reading" || state.refreshing}
          onClick={() => dispatch({ type: "older" })}
        >
          {state.older === "reading" ? WORDS.olderReading : WORDS.showOlder}
        </Button>
      )}
      {state.older === "away" && (
        <Notice tone="warning">{WORDS.olderUnread}</Notice>
      )}
      {state.older === "changed" && (
        <Notice tone="warning">
          <span className="flex flex-col gap-2">
            {WORDS.listChanged}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => dispatch({ type: "readAgain" })}
            >
              {WORDS.readAgain}
            </Button>
          </span>
        </Notice>
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
      return <Reading>{WORDS.reading}</Reading>
    }
    case "read": {
      return null
    }
    case "unpaired": {
      return <Unpaired line={WORDS.unpaired} pair={pair} />
    }
    case "away":
    case "busy":
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
  const playingId = playback.kind === "quiet" ? null : playback.id
  // The take playing stays, with its Stop, until it stops (`notYetHome`).
  const here = notYetHome(takes, playingId, phone.line).filter(
    (take) => take.id === playingId || shows(take)
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

/** One compartment's tile: its mark, count, name and what goes there. */
const TileBody = ({
  compartment,
  count,
}: {
  compartment: Compartment
  count: number
}): JSX.Element => (
  <span className="flex w-full flex-col gap-1.5">
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
        {/* A kind this phone doesn't know shows only while it holds any. */}
        {TAKE_KINDS.filter((kind) => kind !== "other" || counts.other > 0).map(
          (kind) => (
            <li key={kind} className="flex">
              {one(kind)}
            </li>
          )
        )}
      </ul>
      {/* All, the width of the row below the kinds. */}
      {one("all")}
    </div>
  )
}

/**
 * The chips in the top bar (TAKES3, TAKES20): where a take is, its station,
 * its kind (in All), what it is about and how it stands, each with how many
 * takes tapping it shows.
 */
const ChipBar = ({
  groups,
  chips,
  onChips,
  lead,
}: {
  groups: ChipGroups
  chips: Chips
  onChips: (chips: Chips) => void
  /** What leads the bar, before the chips: the order (TAKES20). */
  lead?: ReactNode
}): JSX.Element | null => {
  const { places, stations, kinds, topics, statuses } = groups
  const tap = (pick: ChipPick) => (): void => {
    onChips(toggled(chips, pick))
  }
  const many =
    places.length +
    stations.length +
    kinds.length +
    topics.length +
    statuses.length
  // A lone chip, not picked, would filter nothing (the conveyor's page).
  const filters = many >= 2 || anyPicked(chips)
  if (!filters && lead === undefined) return null
  return (
    <nav aria-label={WORDS.chips} className={CHIP_BAR}>
      {lead}
      {filters && (
        <>
          {places.map(({ chip, count }) => (
            <Chip
              key={`place:${chip}`}
              picked={chips.place === chip}
              count={count}
              dot={chip}
              onTap={tap({ group: "place", value: chip })}
            >
              {WORDS.place[chip]}
            </Chip>
          ))}
          {kinds.map(({ chip, count }) => (
            <Chip
              key={`kind:${chip}`}
              picked={chips.kind === chip}
              count={count}
              dot={null}
              onTap={tap({ group: "kind", value: chip })}
            >
              {WORDS.kinds[chip].many}
            </Chip>
          ))}
          {topics.map(({ chip, count }) => (
            <Chip
              key={`topic:${chip.key}`}
              picked={chips.topic?.key === chip.key}
              count={count}
              dot={null}
              onTap={tap({ group: "topic", value: chip })}
            >
              {chip.label}
            </Chip>
          ))}
          {statuses.map(({ chip, count }) => (
            <Chip
              key={`status:${chip}`}
              picked={chips.status === chip}
              count={count}
              dot={null}
              onTap={tap({ group: "status", value: chip })}
            >
              {WORDS.status[chip]}
            </Chip>
          ))}
          {stations.map(({ chip, count }) => (
            <Chip
              key={`station:${chip}`}
              picked={chips.station === chip}
              count={count}
              dot={null}
              onTap={tap({ group: "station", value: chip })}
            >
              {chip}
            </Chip>
          ))}
        </>
      )}
    </nav>
  )
}

/** How the list is ordered: newest, oldest, or by what it's about. */
const OrderBar = ({
  order,
  onOrder,
}: {
  order: Order
  onOrder: (order: Order) => void
}): JSX.Element => (
  <div
    role="group"
    aria-label={WORDS.orderLabel}
    className="border-border flex shrink-0 gap-1 border-r pr-2"
  >
    {ORDERS.map((each) => (
      <button
        key={each}
        type="button"
        aria-pressed={each === order}
        onClick={() => onOrder(each)}
        className={cn(
          "h-9 shrink-0 rounded-full px-3 text-sm",
          each === order ? "bg-foreground text-background" : "bg-card"
        )}
      >
        {WORDS.order[each]}
      </button>
    ))}
  </div>
)

/**
 * What a take was said for: Studio's by the build's word over its ref's;
 * every other kind through its port.
 */
const aboutWith =
  (about: LibraryAbout | undefined, names: TakeNames) =>
  (
    id: string,
    told: {
      readonly of?: TakeOf | "unknown" | undefined
      readonly ref: string | null
      readonly fields?: Readonly<Record<string, string>> | undefined
    }
  ): TakeAbout => {
    const { ref } = told
    const ported =
      ref === null
        ? null
        : portAbout(
            told.of ?? "studio",
            { ref, fields: told.fields },
            names,
            ABOUT_WORDS
          )
    if (ported !== null) return ported
    return aboutBoth(
      ref === null ? { kind: "here" } : aboutOfRef(ref),
      about?.about(id, ref) ?? null
    )
  }

/** How a take of home's stands. */
function statusOf(take: LibraryTake): TakeStatus {
  if (take.status === "deleted") return "deleted"
  if (take.status === "recording-let-go") return "let-go"
  if (take.status === "set-aside" || take.setAsideAt !== null) return "aside"
  if (take.heard === null) return "waiting"
  return take.heard.text.trim() === "" ? "silent" : "heard"
}

/** What a take's card says it is about, for a search. */
function aboutWords(about: TakeAbout): ReadonlyArray<string> {
  return [
    WORDS.kinds[about.kind].one,
    WORDS.subject(about),
    WORDS.detail(about),
  ].filter((part) => part !== null)
}

/**
 * What home is asked for: the compartment's kinds, or the kind
 * picked in All; the topic picked, when home keys it; the order, but by
 * what it's about, which is the phone's over what home answers.
 */
function queryOf(
  compartment: Compartment | null,
  chips: Chips,
  order: Order
): LibraryQuery {
  const topic = chips.topic ?? null
  return {
    kinds:
      compartment === null ? null : kindsAsked(compartment, chips.kind ?? null),
    about: topic?.asks === true ? topic.key : null,
    sort: order === "oldest" ? "oldest" : "newest",
  }
}

/** Whether the phone's recorder belongs in `compartment`. */
const records = (compartment: Compartment): boolean =>
  compartment === "here" || compartment === "all"

export const TakeLibrary = ({
  ports,
  pair,
  compartment = "all",
  tile,
  row,
  initialChips,
  gaps,
  uses,
}: TakeLibraryProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is made once per mount, as Studio's screens' are; the first read asks for what the page opens on */
  const [library] = useState(() =>
    createTakeLibrary(
      ports,
      queryOf(compartment, { ...NO_CHIPS, ...initialChips }, "newest")
    )
  )
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => library.attach(), [library])
  const state = useSyncExternalStore(library.subscribe, library.getSnapshot)
  const [chips, setChips] = useState<Chips>(() => ({
    ...NO_CHIPS,
    ...initialChips,
  }))
  const [order, setOrder] = useState<Order>("newest")
  const { stations, phone, about, onPhone } = ports
  // Renders again whenever what a row's station or kind says may have changed.
  useSyncExternalStore(
    stations?.subscribe ?? unsubscribed,
    stations?.getSnapshot ?? nothing
  )
  useSyncExternalStore(
    uses?.subscribe ?? unsubscribed,
    uses?.getSnapshot ?? nothing
  )
  useSyncExternalStore(
    about?.subscribe ?? unsubscribed,
    about?.getSnapshot ?? nothing
  )
  const phoneTakes = useSyncExternalStore(
    phone?.subscribe ?? unsubscribed,
    phone?.getSnapshot ?? noPhoneSnapshot
  ).takes
  const ownTakes = useSyncExternalStore(
    onPhone?.subscribe ?? unsubscribed,
    onPhone?.getSnapshot ?? noOwnSnapshot
  )
  const { dispatch } = library
  const aboutOf = aboutWith(about, ports.names ?? NO_NAMES)
  const page = state.read.kind === "read" ? state.read.page : null
  const homeRows: ReadonlyArray<HomeRow> = (page?.takes ?? []).map((take) => {
    const at = stations?.station(take) ?? null
    const said = aboutOf(take.id, take)
    return {
      take,
      about: said,
      kind: said.kind,
      place: "home",
      station: at?.name ?? null,
      canned: at?.canned ?? false,
      topic: topicOf(said),
      status: statusOf(take),
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
      const said = aboutOf(take.id, { ref: null })
      return {
        take,
        about: said,
        kind: said.kind,
        place: "phone",
        station: null,
        topic: topicOf(said),
        status: "waiting",
      }
    })
  // Recorded on Takes itself, they are listed by the recorder (`phone`).
  const recordedHere = new Set(phoneTakes.map(({ id }) => id))
  // One home holds stays, saying so, until a read of home lists it.
  const ownRows: ReadonlyArray<OwnRow> = ownTakes
    .filter(({ id }) => !onHome.has(id) && !recordedHere.has(id))
    .map((own) => {
      const said = aboutOf(own.id, own)
      return {
        own,
        about: said,
        kind: said.kind,
        place: own.home === true ? "home" : "phone",
        station: null,
        topic: topicOf(said),
        status: own.home === true ? undefined : "waiting",
      }
    })
  const sorted: ReadonlyArray<Sorted> = [...phoneRows, ...ownRows, ...homeRows]

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
        {page?.covers === "studio" && (
          <p className="text-muted-foreground text-sm">{WORDS.studioOnly}</p>
        )}
        <Tiles counts={compartmentCounts(sorted)} tile={tile} />
      </div>
    )
  }

  const groups = chipCounts(sorted, compartment, chips, stations?.names ?? [])
  const shows = (each: Sorted): boolean =>
    inCompartment(each, compartment) && underChips(each, chips)
  const phoneShown = phoneRows.filter(shows)
  // The phone's takes have no station, and none is on home.
  const listsPhone = chips.place !== "home" && chips.station === null
  // While the phone records or plays, its controls stay whatever is picked,
  // with the take playing and none other the chips leave out.
  const recorder =
    phone !== undefined &&
    records(compartment) &&
    (listsPhone || state.phone !== "quiet")
  const searchable = state.read.kind !== "unpaired"
  // Home searched what it heard; the phone's own are searched by what
  // they are about, here.
  const ownShown = ownRows.filter(
    (each) =>
      shows(each) &&
      (state.asked === null || holdsWords(aboutWords(each.about), state.asked))
  )
  const listedRows = ordered(
    [...ownShown, ...homeRows.filter(shows)],
    order,
    at
  )
  // Only the topic picked, and nothing searched: then a take missing from
  // the list is one there isn't.
  const topic = chips.place === "phone" ? null : (chips.topic ?? null)
  const topicGaps =
    gaps !== undefined &&
    topic !== null &&
    !anyPicked({ ...chips, topic: null }) &&
    state.asked === null &&
    page !== null
      ? gaps(
          topic.key,
          homeRows.filter(shows).map(({ take }) => take)
        )
      : NO_GAPS
  return (
    <div className="flex flex-col gap-4">
      <ChipBar
        groups={groups}
        chips={chips}
        lead={
          <OrderBar
            order={order}
            onOrder={(next) => {
              setOrder(next)
              dispatch({
                type: "query",
                query: queryOf(compartment, chips, next),
              })
            }}
          />
        }
        onChips={(next) => {
          // A take playing stops if its row leaves with its Stop.
          const { playback } = state
          const playing =
            playback.kind === "quiet"
              ? undefined
              : [...homeRows, ...ownRows].find(
                  (each) =>
                    ("own" in each ? each.own.id : each.take.id) === playback.id
                )
          if (playing !== undefined && !underChips(playing, next)) {
            dispatch({ type: "stop" })
          }
          setChips(next)
          dispatch({ type: "query", query: queryOf(compartment, next, order) })
        }}
      />
      {recorder && (
        <PhoneTakes
          phone={phone}
          shows={(take) => {
            // Every chip picked applies, as it does to the rows below.
            const each = phoneRows.find((one) => one.take.id === take.id)
            return listsPhone && each !== undefined && shows(each)
          }}
        />
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
      <Listed
        page={chips.place === "phone" ? null : page}
        rows={listedRows}
        gaps={topicGaps}
        others={phoneShown.length}
        compartment={compartment}
        chips={chips}
        order={order}
        state={state}
        stations={stations}
        uses={uses}
        row={row}
        dispatch={dispatch}
      />
    </div>
  )
}
