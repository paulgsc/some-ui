import type { JSX } from "react"
import { useId } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { PortionMark } from "@topik/components/topik/handheld/portion-menu"
import type { TopikMetadata } from "@topik/lib/topik"
import { useSceneFile } from "@topik/lib/topik/adapter/hooks/use-scene-file"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import { titleOf } from "@topik/lib/topik/core/drama"
import type { FeedCard, Seed } from "@topik/lib/topik/core/feed-card"
import { cardOf, koreanGenre, seedOf } from "@topik/lib/topik/core/feed-card"
import { PORTION_WORDS } from "@topik/lib/topik/core/portion"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
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
  Sparkles,
  X,
} from "lucide-react"

type MaterialListProps = {
  /** The level the learner holds: read-aloud's, and the prompt's default. */
  level: number
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
   * Word sets added and not opened yet, newest first: "Ready for you", above
   * everything else. Offered with read-aloud only.
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
   * first: "From the routine", at the top. Absent where the host reaches no
   * home.
   */
  fromRoutine?: Array<RoutineCard>
  /** What came of the last one opened. */
  routineNote?: StorageNote | null
  onOpenRoutine?: (key: string) => void
  /** The routine's mark (`RoutineStatus`), shown with or without its files. */
  routineStatus?: JSX.Element
  /** Opens "What are you hungry for?"; absent where it isn't offered. */
  onOrder?: () => void
}

/** A word set pair or a drama the routine left, as its card shows it. */
export type RoutineCard = {
  /** What `onOpenRoutine` is called with. */
  key: string
  kind: "scene" | "drama"
  title: string
  details: string
  /** Opened on this phone before. */
  opened: boolean
}

/** An added word set, as its card shows it. */
type ReadyCard = Pick<ReadAloudDeck, "from" | "practice" | "context"> & {
  id: string
  title: string
  words: number
  lines: number
  level: number
}

const PRACTICE_LABEL: Record<SetPractice, string> = {
  "read-aloud": "Read aloud",
  lens: "Grammar lens",
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
    card.practice && PRACTICE_LABEL[card.practice],
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
  <li className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
    <div className="min-w-0">
      <span className="block font-semibold break-keep">{card.title}</span>
      {card.genres.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1">
          {card.genres.map((genre) => (
            <span
              key={genre}
              lang={koreanGenre(genre) ? "ko" : undefined}
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
            >
              {koreanGenre(genre) ?? genre}
            </span>
          ))}
        </span>
      )}
      {card.premise && (
        <span className="text-muted-foreground mt-1 line-clamp-3 block text-sm break-keep">
          {card.premise}
        </span>
      )}
      {card.level && (
        <span className="text-muted-foreground mt-1 block text-xs">
          TOPIK {card.level}
        </span>
      )}
    </div>
    <div className="flex gap-2">
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
    </div>
  </li>
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

/** A word set pair or a drama the routine left: what it is, and whether it was opened. */
const RoutineCardButton = ({
  card,
  onOpen,
}: {
  card: RoutineCard
  onOpen: (key: string) => void
}): JSX.Element => (
  <li>
    <button
      type="button"
      onClick={() => onOpen(card.key)}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left",
        card.opened ? "bg-card" : "bg-primary/10 border-primary/30"
      )}
    >
      {card.kind === "scene" ? (
        <BookOpenText className="text-primary size-6 shrink-0" />
      ) : (
        <Play className="text-primary size-6 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span lang="ko" className="block font-semibold">
          {card.title}
        </span>
        <span className="text-muted-foreground block text-sm">
          {card.opened ? `${card.details} · Opened` : card.details}
        </span>
      </span>
      <ChevronRight className="text-muted-foreground size-5 shrink-0" />
    </button>
  </li>
)

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
}: MaterialListProps): JSX.Element => (
  <div
    data-slot="topik-material-list"
    data-scroll-intent="long-form"
    className={
      // scroll-intent: long-form — the catalogue is as long as the library;
      // a list a thumb scrolls is the phone's native way to browse one.
      "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
    }
  >
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

    {routineStatus}

    {onOrder && (
      <button
        type="button"
        data-slot="portion-entry"
        onClick={onOrder}
        className="bg-card border-border flex min-h-16 shrink-0 items-center gap-3 rounded-2xl border p-4 text-left"
      >
        <PortionMark portion="meal" className="text-primary size-7 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{PORTION_WORDS.title}</span>
          <span className="text-muted-foreground block text-sm">
            {PORTION_WORDS.entryDetails}
          </span>
        </span>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </button>
    )}

    {onOpenRoutine && fromRoutine.length > 0 && (
      <section aria-label="From the routine" className="flex flex-col gap-2">
        <Heading>From the routine</Heading>
        <ul className="flex flex-col gap-2">
          {fromRoutine.map((card) => (
            <RoutineCardButton
              key={card.key}
              card={card}
              onOpen={onOpenRoutine}
            />
          ))}
        </ul>
        {/* Always mounted, so a note that arrives is announced. */}
        <p
          aria-live="polite"
          data-slot="routine-note"
          className={cn(
            "text-sm empty:hidden",
            routineNote?.tone === "problem"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {routineNote?.text}
        </p>
      </section>
    )}

    {onReadAloud && onOpenSet && readySets.length > 0 && (
      <section aria-label="Ready for you" className="flex flex-col gap-2">
        <Heading>Ready for you</Heading>
        <ul className="flex flex-col gap-2">
          {readySets.map((card) => (
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
      <section aria-label="Pasted this session" className="flex flex-col gap-2">
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

    {dramas.length > 0 && (
      <section aria-label="Dramas" className="flex flex-col gap-2">
        <Heading>Start from a drama</Heading>
        <ul className="flex flex-col gap-2">
          {dramas.map((item) => (
            <Card
              key={item.key}
              card={cardOf(item)}
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
