/**
 * The marks every slide shares: the envelope (our wins against a group's
 * floor and ceiling, on one axis of wins), a result's light, an objective's
 * standing, and the ladder. Each looks the same every week and in the
 * legend, so a viewer reads them without being taught again.
 */
import type { CSSProperties, JSX } from "react"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { rungIndex } from "@playoff-delta/lib/reading"
import { wins, type PoleGroup, type Poles } from "@playoff-delta/lib/story"
import { symbolFor } from "@playoff-delta/lib/symbols"
import {
  COHORTS,
  PIECES,
  RUNG_ORDER,
  RUNGS,
  STANDINGS,
  type PieceNoun,
  type Rung,
  type Standing,
} from "@playoff-delta/lib/words"

import { delay } from "./shared"

/** A span on the axis of wins, as left and width in percent. */
const span = (
  from: number,
  to: number,
  max: number
): CSSProperties & Record<"--l" | "--w", string> => ({
  "--l": `${(Math.min(from, to) / max) * 100}%`,
  "--w": `${(Math.max(Math.abs(to - from), 0.12) / max) * 100}%`,
})

/** Complete class strings, so a content scan sees every one. */
const TONE_CLASS: Readonly<Record<"rivals" | "us", string>> = {
  rivals: "pd-env__span--rivals",
  us: "pd-env__span--us",
}

/**
 * One group's envelope: the rivals' span from the floor to the ceiling, and
 * ours from losing out to winning out, after the week, over the same before
 * it (faint). The axis runs from no wins to a whole season.
 */
export const Envelope = ({
  before,
  after,
  group,
  max,
  at,
}: {
  before: Poles
  after: Poles
  group: "division" | "conference"
  /** Games a team plays in a season: the axis's end. */
  max: number
  at: number
}): JSX.Element => {
  const row = (
    label: string,
    was: readonly [number, number],
    now: readonly [number, number],
    tone: "rivals" | "us",
    reveal: number
  ): JSX.Element => (
    <div className="pd-env__row">
      <span className="pd-mono pd-small">{label}</span>
      <div className="pd-env__track">
        <i
          className="pd-env__span pd-env__span--was"
          style={span(...was, max)}
        />
        <i
          className={`pd-env__span ${TONE_CLASS[tone]} pd-in`}
          style={{ ...span(...now, max), ...delay(reveal) }}
        />
      </div>
      <span className="pd-mono pd-small text-right">
        {wins(now[0])}–{wins(now[1])}
      </span>
    </div>
  )
  const g: PoleGroup = after[group]
  const b: PoleGroup = before[group]
  return (
    <div className="pd-env">
      {row(
        "rivals",
        [b.floor, b.ceiling.lose],
        [g.floor, g.ceiling.lose],
        "rivals",
        at
      )}
      {row(
        "us",
        [before.us.low, before.us.high],
        [after.us.low, after.us.high],
        "us",
        at + 0.4
      )}
      <div className="pd-env__axis pd-mono text-muted-foreground text-[2.4cqw]">
        <span>0</span>
        <span>{max} wins</span>
      </div>
    </div>
  )
}

const COHORT_CLASS: Readonly<Record<keyof typeof COHORTS, string>> = {
  best: "pd-light--made",
  worst: "pd-light--missed",
  forced: "pd-light--forced",
  idle: "pd-light--idle",
}

/** One result: its piece's glyph and a light in its cohort's colour. */
export const ResultLight = ({
  noun,
  cohort,
  label,
  note,
  at,
}: {
  noun: PieceNoun
  cohort: keyof typeof COHORTS
  /** "SEA over LAR". */
  label: string
  /** Under the label: the steps it moved. */
  note?: string
  at: number
}): JSX.Element => {
  const s = symbolFor(noun)
  return (
    <div className="pd-light-cell">
      <div className="flex items-end gap-[1cqw]">
        <SymbolGlyph
          parts={s.parts}
          hue={s.hue}
          delay={at}
          className="size-[6cqw]"
        />
        <i
          role="img"
          aria-label={`${PIECES[noun].noun}: ${label}, ${COHORTS[cohort].phrase}`}
          className={`pd-light ${COHORT_CLASS[cohort]}`}
          style={delay(at)}
        />
      </div>
      <span className="pd-mono pd-small font-semibold">{label}</span>
      {note ? <span className="pd-mono text-[2.5cqw]">{note}</span> : null}
    </div>
  )
}

/** The most lights a grid shows; the rest are counted. */
export const LIGHTS_SHOWN = 8

const STANDING_CLASS: Readonly<Record<Standing, string>> = {
  clinched: "pd-standing--clinched",
  hands: "pd-standing--hands",
  help: "pd-standing--help",
  out: "pd-standing--out",
}

/** An objective's standing, as a stamp in its colour. */
export const StandingChip = ({
  standing,
}: {
  standing: Standing
}): JSX.Element => (
  <span className={`pd-standing ${STANDING_CLASS[standing]}`}>
    {STANDINGS[standing].phrase}
  </span>
)

/**
 * The ladder, best first: the rungs between the best still reachable and the
 * worst already ours lit, the rest faint.
 */
export const Ladder = ({
  best,
  worst,
  at,
}: {
  best: Rung
  worst: Rung
  at: number
}): JSX.Element => (
  <div className="flex flex-col gap-[1.4cqw]">
    {RUNG_ORDER.map((r, i) => {
      const open =
        rungIndex(r) >= rungIndex(best) && rungIndex(r) <= rungIndex(worst)
      return (
        <div
          key={r}
          className={`pd-rung pd-in ${open ? "pd-rung--open" : ""}`}
          style={delay(at + i * 0.2)}
        >
          <b className="text-[4.4cqw]">{RUNGS[r].phrase}</b>
          <span className="pd-mono pd-small text-muted-foreground">
            {r === best && r === worst
              ? r === "out"
                ? "no seat left"
                : "ours"
              : r === best
                ? "best still reachable"
                : r === worst
                  ? r === "out"
                    ? "still possible"
                    : "worst already ours"
                  : RUNGS[r].seeds}
          </span>
        </div>
      )
    })}
  </div>
)
