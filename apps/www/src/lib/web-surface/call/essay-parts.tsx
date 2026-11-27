import type { JSX, ReactNode } from "react"
import { createContext, useContext, useId } from "react"
import { drawNodes } from "@some-ui/shared"
import { CAST_VIEW_BOX, castNodes } from "@some-ui/styles/brand/cast"
import type { Character } from "@some-ui/styles/brand/cast"
import { codeSpans } from "@some-ui/video-render"
import type { Shape, Speaker } from "@some-ui/video-render"

import { ESSAY_WORDS as W } from "./essay-words"

/**
 * What the essays' stages draw alike (`./essay-stage`, the Rust Rounds
 * essay's, and `./interview-essay-stage`, the interview essay's): template
 * A's two bubbles, the tutor and the owner, the one speaking lit, with the
 * scene's content beside them (in the Rust essay's opening, the one asking
 * stands where the tutor does); text with code spans; a mark.
 *
 * A bubble draws the template's cast (PDA6, #2883; C822) when its shape
 * names one (`CastProvider`), else the flat icons below.
 */

/** The tutor's icon: neutral, never any company's mark. */
const TutorIcon = (): JSX.Element => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="size-full">
    <rect width="48" height="48" className="fill-muted" />
    <path
      d="M24 9 37 16.5v15L24 39 11 31.5v-15Z"
      fill="none"
      strokeWidth="2.5"
      className="stroke-foreground"
    />
    <circle cx="24" cy="24" r="4.5" className="fill-foreground" />
  </svg>
)

/** The owner's icon. */
const YouIcon = (): JSX.Element => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="size-full">
    <rect width="48" height="48" className="fill-muted" />
    <circle cx="24" cy="19" r="7" className="fill-foreground" />
    <path d="M10 40c2-8 8-12 14-12s12 4 14 12" className="fill-foreground" />
  </svg>
)

/** The icon of the one who asks the opening's questions (#3269): a question mark. */
const AskerIcon = (): JSX.Element => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="size-full">
    <rect width="48" height="48" className="fill-muted" />
    <path
      d="M18 18a6 6 0 1 1 9 5.2c-2 1.2-3 2.6-3 4.8v1"
      fill="none"
      strokeWidth="3.5"
      strokeLinecap="round"
      className="stroke-foreground"
    />
    <circle cx="24" cy="35.5" r="2.3" className="fill-foreground" />
  </svg>
)

const ICONS: Readonly<Record<Speaker, () => JSX.Element>> = {
  tutor: TutorIcon,
  you: YouIcon,
  asker: AskerIcon,
}

/** The cast a template's shape names, if any. */
type Cast = NonNullable<Shape["cast"]>

/** Who stands for each voice, by cast: the owner is the mark, the synthetic voices tin birds. */
const CASTS: Readonly<Record<Cast, Readonly<Record<Speaker, Character>>>> = {
  "cast-v1": { you: "mochi", tutor: "tin-owlet", asker: "tin-sparrow" },
}

const CastContext = createContext<Cast | undefined>(undefined)

/** Draws every bubble under it in `cast`; with none, the flat icons. */
export const CastProvider = ({
  cast,
  children,
}: {
  cast: Cast | undefined
  children: ReactNode
}): JSX.Element => <CastContext value={cast}>{children}</CastContext>

/** One character, its gradients named for this drawing alone. */
const CastIcon = ({ who }: { who: Character }): JSX.Element => {
  const prefix = useId().replace(/[^A-Za-z0-9]/g, "")
  return (
    <svg
      viewBox={CAST_VIEW_BOX}
      aria-hidden="true"
      className="size-full"
      data-character={who}
    >
      {drawNodes(
        castNodes(who, (name) => `${prefix}-${name}`),
        // The ground is the theme's.
        { groundClass: "fill-muted" }
      )}
    </svg>
  )
}

const Bubble = ({ who, lit }: { who: Speaker; lit: boolean }): JSX.Element => {
  const cast = useContext(CastContext)
  const Icon = ICONS[who]
  return (
    <div
      data-speaker={who}
      data-lit={lit ? "true" : undefined}
      className={
        lit
          ? "text-foreground flex flex-col items-center gap-[0.4em]"
          : "text-muted-foreground flex flex-col items-center gap-[0.4em] opacity-50"
      }
    >
      <div
        className={
          lit
            ? "ring-primary size-[7em] overflow-hidden rounded-full ring-[0.3em]"
            : "size-[7em] overflow-hidden rounded-full"
        }
      >
        {cast === undefined ? <Icon /> : <CastIcon who={CASTS[cast][who]} />}
      </div>
      <p className="text-[0.9em] font-semibold">{W.speakers[who]}</p>
    </div>
  )
}

/**
 * Template A: the two bubbles, the one speaking lit, and the content beside
 * them. In the opening's scenes (`other` "asker") the one asking stands
 * where the tutor does.
 */
export const Call = ({
  speaker,
  tag,
  other = "tutor",
  children,
}: {
  speaker: Speaker
  tag: string
  other?: "tutor" | "asker"
  children: ReactNode
}): JSX.Element => (
  <div className="grid min-h-full grid-cols-[16%_1fr] gap-[1.2em]">
    <div className="flex flex-col items-center justify-center gap-[2em]">
      <Bubble who={other} lit={speaker === other} />
      <Bubble who="you" lit={speaker === "you"} />
    </div>
    <div className="border-border bg-background/60 space-y-[0.6em] rounded-[0.6em] border px-[1.4em] py-[1em]">
      <p className="text-primary text-[0.7em] tracking-wide uppercase">{tag}</p>
      {children}
    </div>
  </div>
)

/** Text with `code` spans drawn as code. */
export const Inline = ({ text }: { text: string }): JSX.Element => (
  <>
    {codeSpans(text).map((span, i) =>
      span.code ? (
        // eslint-disable-next-line react/no-array-index-key
        <code key={i} className="font-mono text-[0.9em]">
          {span.text}
        </code>
      ) : (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i}>{span.text}</span>
      )
    )}
  </>
)

export const MARK_CLASS: Readonly<Record<string, string>> = {
  covered: "text-primary font-semibold",
  partly: "text-foreground font-semibold",
  missing: "text-destructive font-semibold",
}
