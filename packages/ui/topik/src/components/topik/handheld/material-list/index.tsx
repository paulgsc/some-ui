import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import type { TopikMetadata } from "@topik/lib/topik"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import type { FeedCard, Seed } from "@topik/lib/topik/core/feed-card"
import { cardOf, seedOf } from "@topik/lib/topik/core/feed-card"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import {
  BookOpenText,
  ChevronRight,
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
  /** The feed is loading, or failed to load (`error`). */
  loading: boolean
  error: string | null
  onReload: () => void
  /** Opens the opt-in loop; absent where it isn't offered. */
  onCreate?: () => void
  /**
   * "Keep on this account" for the pasted tree, where the host has a learner
   * shelf; shown under it. Absent, it lasts the session.
   */
  keep?: JSX.Element
  /** Opens the read-aloud drill; absent where it isn't offered. */
  onReadAloud?: () => void
}

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
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
            >
              {genre}
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
        aria-label={`Play ${card.title}`}
        onClick={() => onPlay(card.key)}
      >
        <Play className="size-4" /> Play it
      </Button>
    </div>
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
  loading,
  error,
  onReload,
  onCreate,
  keep,
  onReadAloud,
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

    {onCreate && (
      <button
        type="button"
        onClick={onCreate}
        className="border-border flex min-h-16 items-center gap-3 rounded-2xl border border-dashed p-4 text-left"
      >
        <Sparkles className="text-muted-foreground size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Write your own drama</span>
          <span className="text-muted-foreground block text-sm">
            Your model writes it from the app&apos;s prompt, and the app checks
            it. It lasts this session.
          </span>
        </span>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </button>
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

    {pastedTree && (
      <section aria-label="Pasted this session" className="flex flex-col gap-2">
        <Heading>Pasted this session</Heading>
        <PastedCard
          title={pastedTree.lesson.root.place}
          lang="ko"
          details={`Drama · TOPIK ${pastedTree.lesson.level}`}
          onPlay={pastedTree.onPlay}
          forgetLabel="Forget this drama"
          onForget={pastedTree.onForget}
        />
        {keep}
      </section>
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
