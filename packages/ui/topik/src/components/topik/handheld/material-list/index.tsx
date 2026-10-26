import type { JSX } from "react"
import { useId, useState } from "react"
import { cn } from "@some-ui/core-utils"
import { Button, Input } from "@some-ui/shared"
import { FeedThumb, FeedTile } from "@topik/components/topik/handheld/feed-tile"
import { PortionMark } from "@topik/components/topik/handheld/portion-menu"
import type { TopikMetadata } from "@topik/lib/topik"
import { useSceneFile } from "@topik/lib/topik/adapter/hooks/use-scene-file"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import { titleOf } from "@topik/lib/topik/core/drama"
import type { FeedCard, Seed } from "@topik/lib/topik/core/feed-card"
import { cardOf, koreanGenre, seedOf } from "@topik/lib/topik/core/feed-card"
import type { LessonItem } from "@topik/lib/topik/core/lesson-feed"
import {
  FEED_FIRST,
  LESSON_FEED_WORDS,
  levelsHeld,
  searchLessons,
} from "@topik/lib/topik/core/lesson-feed"
import { PORTION_WORDS } from "@topik/lib/topik/core/portion"
import type {
  ReadAloudDeck,
  SetPractice,
} from "@topik/lib/topik/read-aloud/content"
import {
  readAloudLevelFor,
  setGenreKo,
} from "@topik/lib/topik/read-aloud/content"
import {
  BookOpenText,
  ChevronRight,
  FolderOpen,
  Loader2,
  Play,
  ScanSearch,
  Search,
  Sparkles,
  X,
} from "lucide-react"

type MaterialListProps = {
  /** The level the learner holds: read-aloud's, and the prompt's default. */
  level: number
  /** Picking a level to show also holds it. */
  onLevel: (level: number) => void
  /** The scene tree pasted this session, with how to play and forget it. */
  pastedTree?: {
    lesson: DramaLesson
    onPlay: () => void
    onForget: () => void
  } | null
  /** The operator's served scene trees (`adapter/tree-feed`), as cards. */
  dramas: Array<TopikMetadata>
  onPlay: (key: string) => void
  /** A card's premise and genres, for the learner's own drama. */
  onSeed: (seed: Seed) => void
  /** A scene file's text, picked from storage; absent, not offered. */
  onSceneText?: (text: string) => void
  /** Shown under the picker; absent, nothing. */
  sceneFileHint?: string
  /** The feed is loading, or failed to load (`error`). */
  loading: boolean
  error: string | null
  onReload: () => void
  /** Opens the opt-in loop; absent where it isn't offered. */
  onCreate?: () => void
  /** Voice notes in the open scene draft: writing one's own continues it. */
  draftNotes?: number
  /**
   * "Keep on this account" for the pasted tree, where the host has a learner
   * shelf; shown under it. Absent, it lasts the session.
   */
  keep?: JSX.Element
  /** Opens the read-aloud drill; absent where it isn't offered. */
  onReadAloud?: () => void
  /** How many word sets the phone holds: read-aloud's every word. */
  addedSets?: number
  /**
   * Word sets added and not opened yet, newest first: "Ready for you",
   * under the routine's. Offered with read-aloud only.
   */
  readySets?: Array<ReadyCard>
  onOpenSet?: (id: string) => void
  /** A word set file's text, picked from storage; absent, not offered. */
  onSetText?: (text: string) => void
  /** Shown under the word set picker; absent, nothing. */
  setFileHint?: string
  /** What came of the last word set picked, until the next. */
  setNote?: StorageNote | null
  /**
   * What the reflections routine left on home, the ones not opened yet
   * first (`core/lesson-feed`): "From the routine", at the top, the first
   * few shown and the rest a search away. Absent where the host reaches no
   * home.
   */
  fromRoutine?: ReadonlyArray<LessonItem>
  /** What came of the last one opened. */
  routineNote?: StorageNote | null
  /** A scene opens on the set of `practice`; a drama plays. */
  onOpenRoutine?: (key: string, practice?: SetPractice) => void
  /** The routine's mark (`RoutineStatus`), shown with or without its files. */
  routineStatus?: JSX.Element
  /** Opens "What are you hungry for?"; absent where it isn't offered. */
  onOrder?: () => void
}

/** An added word set, as its card shows it. */
type ReadyCard = Pick<ReadAloudDeck, "from" | "practice" | "context"> & {
  id: string
  title: string
  words: number
  lines: number
  level: number
}

/** What a set holds: a lens set's lines, any other set's words. */
const sizeOf = (card: ReadyCard): string =>
  card.practice === "lens"
    ? `${card.lines} line${card.lines === 1 ? "" : "s"}`
    : `${card.words} word${card.words === 1 ? "" : "s"}`

/** TOPIK 2 · Grammar lens · 로맨스 · its title. */
const setLineOf = (card: ReadyCard): string =>
  [
    `TOPIK ${card.level}`,
    card.practice && LESSON_FEED_WORDS.practice[card.practice],
    card.context && setGenreKo(card.context.genre),
    card.title,
  ]
    .filter(Boolean)
    .join(" · ")

/** A pick's outcome, shown on its card in place of what the card offers. */
export type StorageNote = { tone: "done" | "problem"; text: string }

const Heading = ({ children }: { children: string }): JSX.Element => (
  <h2 className="text-muted-foreground px-1 pt-2 text-xs font-medium tracking-wider uppercase">
    {children}
  </h2>
)

/**
 * A served drama as a card: its title, genres and premise. Mainly a seed for
 * the learner's own drama; it can also be played as it is.
 */
const Card = ({
  card,
  onSeed,
  onPlay,
}: {
  card: FeedCard
  onSeed: (card: FeedCard) => void
  onPlay: (key: string) => void
}): JSX.Element => (
  <FeedTile
    title={card.title}
    thumb={
      <FeedThumb
        kind="drama"
        genreKo={card.genres.map(koreanGenre).find(Boolean)}
      />
    }
    tags={[
      ...(card.level ? [{ label: `TOPIK ${card.level}` }] : []),
      ...card.genres.map((genre) => {
        const ko = koreanGenre(genre)
        return ko ? { label: ko, lang: "ko" } : { label: genre }
      }),
    ]}
    {...(card.premise ? { premise: card.premise } : {})}
  >
    <Button
      className="h-11 min-w-0 flex-1 gap-2 rounded-xl"
      aria-label={`Make my own from ${card.title}`}
      onClick={() => onSeed(card)}
    >
      <Sparkles className="size-4" /> Make my own
    </Button>
    <Button
      variant="outline"
      className="h-11 gap-2 rounded-xl"
      aria-label={`Play it: ${card.title}`}
      onClick={() => onPlay(card.key)}
    >
      <Play className="size-4" /> Play it
    </Button>
  </FeedTile>
)

/**
 * "Open … from storage": the system picker, then the file's text. Its read
 * is this card's, so leaving the list lets it go. What the text holds is the
 * caller's to judge, and `note` says what came of it.
 */
const OpenFromStorage = ({
  title,
  offer,
  onText,
  hint,
  note = null,
}: {
  title: string
  /** What the card offers, while nothing is reading and nothing to note. */
  offer: string
  onText: (text: string) => void
  hint?: string
  note?: StorageNote | null
}): JSX.Element => {
  const { state, open } = useSceneFile()
  const name = useId()
  const about = useId()
  const where = useId()
  const problem =
    state.kind === "failed"
      ? state.summary
      : state.kind === "idle" && note?.tone === "problem"
        ? note.text
        : null
  return (
    <label className="bg-card border-border focus-within:ring-ring relative flex min-h-16 shrink-0 cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left focus-within:ring-2">
      <FolderOpen className="text-primary size-6 shrink-0" />
      <span className="min-w-0 flex-1">
        <span id={name} className="block font-semibold">
          {title}
        </span>
        <span
          id={about}
          aria-live="polite"
          className={cn(
            "block text-sm",
            problem ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {problem ??
            (state.kind === "reading"
              ? "Opening..."
              : note?.tone === "done"
                ? note.text
                : offer)}
        </span>
        {hint && (
          <span id={where} className="text-muted-foreground block text-xs">
            {hint}
          </span>
        )}
      </span>
      <input
        type="file"
        // Named by the title alone; the hint or the read's state describes it.
        aria-labelledby={name}
        aria-describedby={hint ? `${about} ${where}` : about}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          // The same file again is a new pick.
          event.currentTarget.value = ""
          if (file) open(file, onText)
        }}
      />
    </label>
  )
}

const HANGUL = /[\uAC00-\uD7A3]/

/**
 * A scene or a drama the routine left, as a feed card: a scene offers each
 * of its sets as a session of its own, a drama plays.
 */
const RoutineTile = ({
  item,
  onOpen,
}: {
  item: LessonItem
  onOpen: (key: string, practice?: SetPractice) => void
}): JSX.Element => {
  const genreKo = item.genre === undefined ? undefined : setGenreKo(item.genre)
  return (
    <FeedTile
      title={item.name}
      {...(HANGUL.test(item.name) ? { lang: "ko" } : {})}
      fresh={!item.opened}
      thumb={
        <FeedThumb
          kind={item.kind === "scene" ? "words" : "drama"}
          genreKo={genreKo}
        />
      }
      tags={[
        ...(item.level === undefined ? [] : [{ label: `TOPIK ${item.level}` }]),
        ...(item.kind === "drama" ? [{ label: "Drama" }] : []),
        ...(genreKo === undefined ? [] : [{ label: genreKo, lang: "ko" }]),
        ...(item.opened ? [{ label: LESSON_FEED_WORDS.opened }] : []),
      ]}
      {...(item.premise ? { premise: item.premise } : {})}
    >
      {item.kind === "drama" ? (
        <Button
          className="h-11 min-w-0 flex-1 gap-2 rounded-xl"
          aria-label={`${LESSON_FEED_WORDS.play}: ${item.name}`}
          onClick={() => onOpen(item.key)}
        >
          <Play className="size-4" /> {LESSON_FEED_WORDS.play}
        </Button>
      ) : (
        item.sessions.map((session, at) => (
          <Button
            key={session.id}
            variant={at === 0 ? "default" : "outline"}
            data-slot="lesson-session"
            className="h-auto min-h-11 min-w-0 flex-1 flex-col gap-0 rounded-xl py-1.5"
            aria-label={`${LESSON_FEED_WORDS.practice[session.practice]}: ${item.name}`}
            onClick={() => onOpen(item.key, session.practice)}
          >
            <span className="flex items-center gap-2">
              {session.practice === "lens" ? (
                <ScanSearch className="size-4" />
              ) : (
                <BookOpenText className="size-4" />
              )}
              {LESSON_FEED_WORDS.practice[session.practice]}
            </span>
            <span className="text-xs font-normal opacity-80">
              {session.opened
                ? `${session.size} · ${LESSON_FEED_WORDS.opened}`
                : session.size}
            </span>
          </Button>
        ))
      )}
    </FeedTile>
  )
}

/**
 * "From the routine": the first few, and a search over all of them once
 * there are more than that.
 */
const FromRoutine = ({
  items,
  note,
  onOpen,
}: {
  items: ReadonlyArray<LessonItem>
  note: StorageNote | null
  onOpen: (key: string, practice?: SetPractice) => void
}): JSX.Element => {
  const [query, setQuery] = useState("")
  const shown = searchLessons(items, query)
  const searching = query.trim() !== ""
  const status = searching
    ? shown.length === 0
      ? LESSON_FEED_WORDS.none(query)
      : LESSON_FEED_WORDS.found(shown.length)
    : items.length > shown.length
      ? LESSON_FEED_WORDS.more(shown.length, items.length)
      : ""
  return (
    <section
      aria-label={LESSON_FEED_WORDS.heading}
      className="flex flex-col gap-2"
    >
      <Heading>{LESSON_FEED_WORDS.heading}</Heading>
      {/* Kept while a query is held, so a level picked under it can clear it. */}
      {(items.length > FEED_FIRST || query !== "") && (
        <div role="search" className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            enterKeyHint="search"
            aria-label={LESSON_FEED_WORDS.search}
            placeholder={LESSON_FEED_WORDS.placeholder}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="h-11 rounded-xl pl-9"
          />
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {shown.map((item) => (
          <RoutineTile key={item.key} item={item} onOpen={onOpen} />
        ))}
      </ul>
      <p
        aria-live="polite"
        data-slot="routine-search-status"
        className="text-muted-foreground px-1 text-sm empty:hidden"
      >
        {status}
      </p>
      {/* Always mounted, so a note that arrives is announced. */}
      <p
        aria-live="polite"
        data-slot="routine-note"
        className={cn(
          "text-sm empty:hidden",
          note?.tone === "problem"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {note?.text}
      </p>
    </section>
  )
}

const ReadyCardButton = ({
  card,
  onOpen,
}: {
  card: ReadyCard
  onOpen: (id: string) => void
}): JSX.Element => (
  <li>
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className="bg-primary/10 border-primary/30 flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left"
    >
      <BookOpenText className="text-primary size-6 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {sizeOf(card)}
          <span className="text-primary ml-2 text-xs font-bold tracking-wider uppercase">
            New
          </span>
        </span>
        <span className="text-muted-foreground block text-sm">
          {setLineOf(card)}
        </span>
        {card.context && (
          <span
            data-slot="ready-set-premise"
            className="text-muted-foreground block text-xs"
          >
            {card.context.premise}
          </span>
        )}
        {card.from && (
          <span
            data-slot="ready-set-from"
            className="text-muted-foreground block text-xs"
          >
            {`From ${card.from}`}
          </span>
        )}
      </span>
      <ChevronRight className="text-muted-foreground size-5 shrink-0" />
    </button>
  </li>
)

/** The tree pasted this session: it plays, and it can be let go. */
const PastedCard = ({
  title,
  lang,
  details: about,
  onPlay,
  forgetLabel,
  onForget,
}: {
  title: string
  lang?: string
  details: string
  onPlay: () => void
  forgetLabel: string
  onForget?: () => void
}): JSX.Element => (
  <div className="bg-card border-border flex min-h-16 items-stretch rounded-2xl border">
    <button
      type="button"
      onClick={onPlay}
      className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span lang={lang} className="block truncate font-semibold">
          {title}
        </span>
        <span className="text-muted-foreground mt-1 block text-xs">
          {about} · until this tab closes
        </span>
      </span>
    </button>
    {onForget && (
      <button
        type="button"
        aria-label={forgetLabel}
        onClick={onForget}
        className="text-muted-foreground flex w-12 shrink-0 items-center justify-center"
      >
        <X className="size-4" />
      </button>
    )}
  </div>
)

/**
 * The levels the list holds something at, and "All": picking one shows only
 * what is at that level. Only levels something is at are offered, so none
 * shows an empty list.
 */
const LevelFilter = ({
  held,
  only,
  onOnly,
}: {
  held: ReadonlyArray<{ level: number; count: number }>
  only: number | null
  onOnly: (level: number | null) => void
}): JSX.Element => {
  const chip = (checked: boolean): string =>
    cn(
      "h-9 shrink-0 rounded-full border px-3 text-sm font-semibold",
      checked
        ? "border-primary/40 bg-primary/15"
        : "border-border bg-card text-muted-foreground"
    )
  return (
    <div
      role="radiogroup"
      aria-label={LESSON_FEED_WORDS.levels}
      className="flex flex-wrap gap-1.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={only === null}
        onClick={() => onOnly(null)}
        className={chip(only === null)}
      >
        {LESSON_FEED_WORDS.all}
      </button>
      {held.map(({ level, count }) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={only === level}
          aria-label={`TOPIK ${level}`}
          onClick={() => onOnly(level)}
          className={chip(only === level)}
        >
          {`TOPIK ${level}`}
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            {count}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * The handheld start screen: the dramas there are to step into, the
 * operator's served ones in the order they are served and one the learner's
 * own model wrote. With none served, writing one is the way in.
 */
export const MaterialList = ({
  level,
  onLevel,
  pastedTree = null,
  dramas,
  onPlay,
  onSeed,
  onSceneText,
  sceneFileHint,
  loading,
  error,
  onReload,
  onCreate,
  draftNotes = 0,
  keep,
  onReadAloud,
  addedSets = 0,
  readySets = [],
  onOpenSet,
  onSetText,
  setFileHint,
  setNote,
  fromRoutine = [],
  routineNote = null,
  onOpenRoutine,
  routineStatus,
  onOrder,
}: MaterialListProps): JSX.Element => {
  // The level shown alone; null shows every level.
  const [only, setOnly] = useState<number | null>(null)
  const dramaCards = dramas.map((item) => cardOf(item))
  const held = levelsHeld([
    ...fromRoutine.map((item) => item.level),
    ...readySets.map((card) => card.level),
    ...dramaCards.map((card) => card.level),
  ])
  // A level picked, then gone from the list (a new home's answer), shows all.
  const showing = held.some(({ level: at }) => at === only) ? only : null
  const atLevel = (at: number | undefined): boolean =>
    showing === null || at === showing
  const routineShown = fromRoutine.filter((item) => atLevel(item.level))
  const readyShown = readySets.filter((card) => atLevel(card.level))
  const dramasShown = dramaCards.filter((card) => atLevel(card.level))
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
      {held.length > 1 && (
        <LevelFilter
          held={held}
          only={showing}
          onOnly={(next) => {
            setOnly(next)
            if (next !== null) onLevel(next)
          }}
        />
      )}

      {routineStatus}

      {onOrder && (
        <button
          type="button"
          data-slot="portion-entry"
          onClick={onOrder}
          className="bg-card border-border flex min-h-16 shrink-0 items-center gap-3 rounded-2xl border p-4 text-left"
        >
          <PortionMark
            portion="meal"
            className="text-primary size-7 shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{PORTION_WORDS.title}</span>
            <span className="text-muted-foreground block text-sm">
              {PORTION_WORDS.entryDetails}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-5 shrink-0" />
        </button>
      )}

      {onOpenRoutine && routineShown.length > 0 && (
        <FromRoutine
          items={routineShown}
          note={routineNote}
          onOpen={onOpenRoutine}
        />
      )}

      {onReadAloud && onOpenSet && readyShown.length > 0 && (
        <section aria-label="Ready for you" className="flex flex-col gap-2">
          <Heading>Ready for you</Heading>
          <ul className="flex flex-col gap-2">
            {readyShown.map((card) => (
              <ReadyCardButton key={card.id} card={card} onOpen={onOpenSet} />
            ))}
          </ul>
        </section>
      )}

      {onReadAloud && onSetText && (
        <OpenFromStorage
          title="Open new words from storage"
          offer="A word set your agent saved, from your drive or this phone."
          onText={onSetText}
          hint={setFileHint}
          note={setNote}
        />
      )}

      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="bg-muted/40 flex min-h-16 shrink-0 items-center gap-3 rounded-2xl p-4 text-left"
        >
          <Sparkles className="text-muted-foreground size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {draftNotes > 0 ? "Continue your scene" : "Write your own drama"}
            </span>
            <span className="text-muted-foreground block text-sm">
              {draftNotes > 0
                ? `${draftNotes} voice note${draftNotes === 1 ? "" : "s"} so far. Share them with the prompt, or let the scene go, to start another.`
                : "Your model writes it from the app's prompt, and the app checks it. It lasts this session."}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-5 shrink-0" />
        </button>
      )}

      {onReadAloud && addedSets === 0 && (
        <div
          data-slot="read-aloud-empty"
          className="bg-card border-border flex min-h-16 shrink-0 items-center gap-3 rounded-2xl border p-4"
        >
          <BookOpenText className="text-muted-foreground size-6 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Read aloud</span>
            <span className="text-muted-foreground block text-sm">
              Nothing to read yet. Open new words from storage, above.
            </span>
          </span>
        </div>
      )}

      {onReadAloud && addedSets > 0 && (
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
            <span
              data-slot="read-aloud-card-level"
              className="text-muted-foreground mt-1 block text-xs"
            >
              {level > readAloudLevelFor(level)
                ? `TOPIK ${readAloudLevelFor(level)}, the highest it reads`
                : `TOPIK ${level}`}
              {` · ${addedSets} word set${addedSets === 1 ? "" : "s"}`}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-5 shrink-0" />
        </button>
      )}

      {pastedTree && (
        <section
          aria-label="Pasted this session"
          className="flex flex-col gap-2"
        >
          <Heading>Pasted this session</Heading>
          <PastedCard
            title={titleOf(pastedTree.lesson)}
            lang="ko"
            details={`Drama · TOPIK ${pastedTree.lesson.level}`}
            onPlay={pastedTree.onPlay}
            forgetLabel="Forget this drama"
            onForget={pastedTree.onForget}
          />
          {keep}
        </section>
      )}

      {onSceneText && (
        <OpenFromStorage
          title="Open a scene from storage"
          offer="A drama your model or agent saved, from your drive or this phone."
          onText={onSceneText}
          hint={sceneFileHint}
        />
      )}

      {dramasShown.length > 0 && (
        <section aria-label="Dramas" className="flex flex-col gap-2">
          <Heading>Start from a drama</Heading>
          <ul className="flex flex-col gap-2">
            {dramasShown.map((card) => (
              <Card
                key={card.key}
                card={card}
                onSeed={(card) => onSeed(seedOf(card))}
                onPlay={onPlay}
              />
            ))}
          </ul>
        </section>
      )}

      {loading && (
        <p className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading this week&apos;s
          dramas...
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

      {!loading && !error && dramas.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No dramas this week yet.
        </p>
      )}
    </div>
  )
}
