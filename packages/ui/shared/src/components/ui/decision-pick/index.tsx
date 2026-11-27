import type { JSX, ReactNode } from "react"

import { cn } from "../../../lib/utils"

/*
 * A decision at a fork (RR29, paulgsc/some-ui#3257; C693): the options an
 * agent listed, exactly one marked recommended, and "something else", the
 * person's own option, which they then say in their own words. One tap
 * picks; tapping another changes the pick, and the host keeps every pick
 * (never lose the record). Nothing picked means the host's own default,
 * which it says in `words.none`: Rust Rounds goes with the recommended.
 *
 * Shared with Interview week's decision drills (IW13, #3181), which check a
 * pick at once against what main chose; Rust Rounds checks it after the
 * deadline against the week's best fit. The host holds the pick as data and
 * passes it back in: this draws it and forwards taps, nothing more. Each
 * option is a button, pressed while picked, in a group named for the fork;
 * what an option `shows` (a preview's clip, HOST16) sits above its button,
 * outside it.
 */

/** An option as listed: its id ("A"), what it would do, and whether it is the recommended one. */
export type DecisionOption = {
  readonly id: string
  /** What it would do, as the host draws it (code in its own face, say). */
  readonly decision: ReactNode
  readonly recommended: boolean
  /**
   * What the option shows before it is picked (a clip playing, say), drawn
   * above its button and outside it, so watching it never picks.
   */
  readonly shows?: ReactNode
  /** Held on its own, as a preview whose clip can't play yet is (HOST16). */
  readonly disabled?: boolean
}

/** What is picked: a listed option, or the person's own. */
export type DecisionPicked =
  | { readonly kind: "option"; readonly option: string }
  | { readonly kind: "own" }

/** Every word the pick shows, from the host's table. */
export type DecisionPickWords = {
  /** The group's name, for a screen reader: the fork's question. */
  readonly label: string
  /** The tag on the recommended option: "Recommended". */
  readonly recommended: string
  /** The own option's words: "Something else: say it". */
  readonly own: string
  /** What stands while nothing is picked: "Going with the recommended". */
  readonly none: string
}

export type DecisionPickProps = {
  readonly options: ReadonlyArray<DecisionOption>
  readonly picked: DecisionPicked | null
  readonly onPick: (pick: DecisionPicked) => void
  readonly words: DecisionPickWords
  /** Held, as while a take records. */
  readonly disabled?: boolean
}

const isPicked = (
  picked: DecisionPicked | null,
  option: string | null
): boolean =>
  picked !== null &&
  (option === null
    ? picked.kind === "own"
    : picked.kind === "option" && picked.option === option)

const ROW =
  "grid min-h-11 w-full grid-cols-[2ch_1fr] items-baseline gap-x-2.5 rounded-xl border px-3 py-2 text-left text-sm [overflow-wrap:anywhere] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"

const rowClass = (on: boolean): string =>
  cn(
    ROW,
    on
      ? "border-brand bg-brand/10 font-semibold"
      : "border-border bg-card active:bg-muted"
  )

/** The options of a fork, and the person's own, one of them picked. */
export const DecisionPick = ({
  options,
  picked,
  onPick,
  words,
  disabled = false,
}: DecisionPickProps): JSX.Element => (
  <div className="flex flex-col gap-2">
    <div
      role="group"
      aria-label={words.label}
      className="flex flex-col gap-1.5"
    >
      {options.map((option) => {
        const on = isPicked(picked, option.id)
        const button = (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            disabled={disabled || option.disabled === true}
            onClick={() => onPick({ kind: "option", option: option.id })}
            className={rowClass(on)}
          >
            <span className="font-extrabold">{option.id}</span>
            <span>
              {option.recommended && (
                <span className="mr-1.5 text-xs font-bold tracking-wide uppercase">
                  {words.recommended}
                </span>
              )}
              {option.decision}
            </span>
          </button>
        )
        return option.shows === undefined ? (
          button
        ) : (
          <div key={option.id} className="flex flex-col gap-1.5">
            {option.shows}
            {button}
          </div>
        )
      })}
      <button
        type="button"
        aria-pressed={isPicked(picked, null)}
        disabled={disabled}
        onClick={() => onPick({ kind: "own" })}
        className={rowClass(isPicked(picked, null))}
      >
        <span aria-hidden="true" className="font-extrabold">
          +
        </span>
        <span>{words.own}</span>
      </button>
    </div>
    {picked === null && (
      <p className="text-muted-foreground text-xs">{words.none}</p>
    )}
  </div>
)
