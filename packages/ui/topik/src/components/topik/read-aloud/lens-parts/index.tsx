/**
 * The grammar lens on screen (`read-aloud/lens`): a Korean question word, an
 * icon and a hue per role, per tense the card's weather, and the two pieces
 * a rep card adds for a lens, its badge and the tense choices.
 *
 * The label is the Korean question the role answers (누가, 어디서), so the
 * lens teaches the question along with the role and shows no English; the
 * English is for screen readers only. Tense is never a word's hue: it tints
 * the card, so a tense lens is answered by reading the verb's form, not by
 * matching a colour.
 *
 * The hues are categories, not states: no theme token names "the place a
 * thing is done", so each is a fixed Tailwind hue, kept apart in lightness as
 * well as hue and doubled by its icon, so no role is told by colour alone.
 */

import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import type { GrammarRole, Tense } from "@topik/lib/topik/read-aloud/content"
import { TENSES } from "@topik/lib/topik/read-aloud/content"
import type { Lens, LensOutcome } from "@topik/lib/topik/read-aloud/lens"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRightToLine,
  Bus,
  Check,
  Clock,
  MapPin,
  Pointer,
  Sparkles,
  Spotlight,
  Target,
  User,
  Users,
  Zap,
} from "lucide-react"

export type LensLook = {
  /** What the learner reads: Korean only. */
  label: string
  /** What a screen reader hears. */
  spoken: string
  Icon: LucideIcon
  /** The hue as text, as a fill, and as an outline. */
  text: string
  tint: string
  ring: string
}

export const ROLE_LOOK: Record<GrammarRole, LensLook> = {
  subject: {
    label: "누가",
    spoken: "who does it",
    Icon: User,
    text: "text-blue-600 dark:text-blue-400",
    tint: "bg-blue-500/15",
    ring: "border-blue-500",
  },
  topic: {
    label: "은 · 는",
    spoken: "what it is about",
    Icon: Spotlight,
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    tint: "bg-fuchsia-500/15",
    ring: "border-fuchsia-500",
  },
  object: {
    label: "무엇을",
    spoken: "what is acted on",
    Icon: Target,
    text: "text-orange-600 dark:text-orange-400",
    tint: "bg-orange-500/15",
    ring: "border-orange-500",
  },
  place: {
    label: "어디서",
    spoken: "where it is done",
    Icon: MapPin,
    text: "text-teal-600 dark:text-teal-400",
    tint: "bg-teal-500/15",
    ring: "border-teal-500",
  },
  goal: {
    label: "어디에",
    spoken: "where to, or where it is",
    Icon: ArrowRightToLine,
    text: "text-lime-700 dark:text-lime-400",
    tint: "bg-lime-500/15",
    ring: "border-lime-500",
  },
  time: {
    label: "언제",
    spoken: "when",
    Icon: Clock,
    text: "text-yellow-700 dark:text-yellow-300",
    tint: "bg-yellow-400/20",
    ring: "border-yellow-500",
  },
  means: {
    label: "무엇으로",
    spoken: "by what means",
    Icon: Bus,
    text: "text-indigo-600 dark:text-indigo-300",
    tint: "bg-indigo-500/15",
    ring: "border-indigo-500",
  },
  company: {
    label: "누구와",
    spoken: "with whom",
    Icon: Users,
    text: "text-pink-600 dark:text-pink-400",
    tint: "bg-pink-500/15",
    ring: "border-pink-500",
  },
  describing: {
    label: "어때요",
    spoken: "the describing verb",
    Icon: Sparkles,
    text: "text-violet-600 dark:text-violet-400",
    tint: "bg-violet-500/15",
    ring: "border-violet-500",
  },
  action: {
    label: "뭐 해요",
    spoken: "the action verb",
    Icon: Zap,
    text: "text-red-600 dark:text-red-400",
    tint: "bg-red-500/15",
    ring: "border-red-500",
  },
}

export type TenseLook = Omit<LensLook, "Icon"> & {
  /** Where the dot sits on the timeline, out of 48. */
  dot: number
  /** The card's weather once the tense is shown. */
  card: string
}

export const TENSE_LOOK: Record<Tense, TenseLook> = {
  past: {
    label: "과거",
    spoken: "past",
    dot: 6,
    text: "text-amber-700 dark:text-amber-400",
    tint: "bg-amber-500/15",
    ring: "border-amber-500",
    card: "bg-amber-500/10",
  },
  present: {
    label: "현재",
    spoken: "present",
    dot: 24,
    text: "text-foreground",
    tint: "bg-muted",
    ring: "border-foreground/60",
    card: "bg-muted/60",
  },
  future: {
    label: "미래",
    spoken: "future",
    dot: 42,
    text: "text-sky-700 dark:text-sky-300",
    tint: "bg-sky-500/15",
    ring: "border-sky-500",
    card: "bg-sky-500/10",
  },
}

/** The question every tense lens asks, in place of a role's. */
const TENSE_QUESTION = "과거 · 현재 · 미래"

/** A timeline with a dot on it: where the tense sits, or none yet. */
const Timeline = ({
  dot,
  className,
}: {
  dot: number | null
  className?: string
}): JSX.Element => (
  <svg viewBox="0 0 48 24" aria-hidden="true" className={className}>
    <path
      d="M4 12h40M4 8v8M24 9v6M44 8v8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
    {dot !== null && <circle cx={dot} cy={12} r={5} fill="currentColor" />}
  </svg>
)

const SPOKEN_OUTCOME: Record<LensOutcome, string> = {
  found: "Found. ",
  missed: "Missed. ",
  unanswered: "",
}

/**
 * What the lens asks, above the line; at the gloss, its answer. Before the
 * gloss a tense lens names no tense, since its colour would give it away.
 * At the gloss a screen reader hears the outcome and the answer's words,
 * which the line shows only by colour and strike-through.
 */
export const LensBadge = ({
  lens,
  outcome,
  answer,
}: {
  lens: Lens
  /** Null until the gloss shows the answer. */
  outcome: LensOutcome | null
  /** The words the answer is shown on, as written. */
  answer: string
}): JSX.Element => {
  const shown = outcome !== null
  const look =
    lens.kind === "role"
      ? ROLE_LOOK[lens.role]
      : shown
        ? TENSE_LOOK[lens.tense]
        : null
  const label = look?.label ?? TENSE_QUESTION
  const asked =
    lens.kind === "role"
      ? `Find ${ROLE_LOOK[lens.role].spoken}`
      : "Which tense?"
  const spoken =
    outcome === null || !look
      ? asked
      : `${SPOKEN_OUTCOME[outcome]}${lens.kind === "role" ? look.spoken : `The tense: ${look.spoken}`}: ${answer}`
  const Icon = lens.kind === "role" ? ROLE_LOOK[lens.role].Icon : null
  return (
    <span
      data-slot="read-aloud-lens"
      data-lens={lens.kind === "role" ? lens.role : "tense"}
      data-outcome={outcome ?? undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-base font-bold",
        look
          ? cn(look.text, look.tint, look.ring)
          : "border-border text-foreground"
      )}
    >
      {Icon ? (
        <Icon className="size-5" aria-hidden="true" />
      ) : (
        <Timeline
          dot={
            shown && lens.kind === "tense" ? TENSE_LOOK[lens.tense].dot : null
          }
          className="h-5 w-10"
        />
      )}
      <span lang="ko" aria-hidden="true">
        {label}
      </span>
      <span className="sr-only" aria-live="polite">
        {spoken}
      </span>
      {outcome === "found" && <Check className="size-5" aria-hidden="true" />}
    </span>
  )
}

/** Under a role lens, until the gloss: the answer is a word in the line. */
export const PickHint = ({ picked }: { picked: boolean }): JSX.Element => (
  <p
    className={cn(
      "flex items-center justify-center gap-2 py-1 text-sm transition-colors",
      picked ? "text-foreground" : "text-muted-foreground"
    )}
  >
    <Pointer className="size-5" aria-hidden="true" />
    <span lang="ko">{picked ? "골랐어요" : "문장에서 고르세요"}</span>
    <span className="sr-only">
      {picked
        ? "Chosen. Tap it again to take it back."
        : "Tap the word in the sentence."}
    </span>
  </p>
)

/**
 * A tense lens's answers, past to future as a timeline runs. At the gloss
 * the line's tense is marked, and a wrong pick is left greyed beside it.
 */
export const TenseChoices = ({
  picked,
  shown,
  onPick,
}: {
  picked: Tense | null
  /** The line's tense, once the gloss shows it; null before. */
  shown: Tense | null
  onPick: (tense: Tense) => void
}): JSX.Element => (
  <div className="grid grid-cols-3 gap-2" data-slot="read-aloud-tenses">
    {TENSES.map((tense) => {
      const look = TENSE_LOOK[tense]
      const right = shown === tense
      const chosen = picked === tense
      return (
        <button
          key={tense}
          type="button"
          aria-pressed={chosen}
          aria-label={look.spoken}
          disabled={shown !== null}
          onClick={() => onPick(tense)}
          className={cn(
            "flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 transition-colors disabled:cursor-default",
            right
              ? cn(look.text, look.tint, look.ring)
              : chosen
                ? shown === null
                  ? "border-foreground bg-muted text-foreground"
                  : "border-muted-foreground/40 text-muted-foreground line-through"
                : shown === null
                  ? "border-border text-foreground"
                  : "border-border text-muted-foreground opacity-50"
          )}
        >
          <Timeline dot={look.dot} className="h-5 w-10" />
          <span lang="ko" className="text-sm font-semibold">
            {look.label}
          </span>
        </button>
      )
    })}
  </div>
)
