import type { JSX, ReactNode } from "react"
import { codeSpans } from "@some-ui/video-render"
import type { Speaker } from "@some-ui/video-render"

import { ESSAY_WORDS as W } from "./essay-words"

/**
 * What the essays' stages draw alike (`./essay-stage`, the Rust Rounds
 * essay's, and `./interview-essay-stage`, the interview essay's): template
 * A's two bubbles, the tutor and the owner, the one speaking lit, with the
 * scene's content beside them; text with code spans; a mark.
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

const Bubble = ({ who, lit }: { who: Speaker; lit: boolean }): JSX.Element => (
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
      {who === "tutor" ? <TutorIcon /> : <YouIcon />}
    </div>
    <p className="text-[0.9em] font-semibold">
      {who === "tutor" ? W.tutor : W.you}
    </p>
  </div>
)

/** Template A: the two bubbles, the one speaking lit, and the content beside them. */
export const Call = ({
  speaker,
  tag,
  children,
}: {
  speaker: Speaker
  tag: string
  children: ReactNode
}): JSX.Element => (
  <div className="grid min-h-full grid-cols-[16%_1fr] gap-[1.2em]">
    <div className="flex flex-col items-center justify-center gap-[2em]">
      <Bubble who="tutor" lit={speaker === "tutor"} />
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
