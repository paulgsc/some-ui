/**
 * The week's first three readings: our division's poles (1), our
 * conference's (2), and which way each result moved us (3).
 */
import type { JSX } from "react"
import {
  blocLine,
  ceilingLine,
  cleanRun,
  cohortCounts,
  movesOf,
  stepsOf,
} from "@playoff-delta/lib/reading"
import { MODEL } from "@playoff-delta/lib/slides"
import { steps, wins, type StoryResult } from "@playoff-delta/lib/story"
import {
  CLEAN_RUN,
  COHORT_ORDER,
  COHORTS,
  GROUPS,
  POLES,
  type GroupKey,
} from "@playoff-delta/lib/words"

import { Envelope, LIGHTS_SHOWN, ResultLight } from "./marks"
import { Kicker, Reveal, type SlideProps } from "./shared"

/** "SEA over LAR". */
const label = (r: StoryResult): string =>
  `${r.winner} over ${r.winner === r.home ? r.away : r.home}`

const GroupSlide = ({
  season,
  week,
  group,
}: SlideProps & { group: GroupKey }): JSX.Element => {
  const { before, after } = week.poles
  const g = after[group]
  const moved = stepsOf(week, group)
  return (
    <>
      <Kicker>
        Week {week.week} · {GROUPS[group].word}
      </Kicker>
      <div className="grid grid-cols-2 gap-[3cqw]">
        <div>
          <span className="pd-mono pd-small text-muted-foreground">
            {POLES.floor.word}
          </span>
          <b className="pd-big block">{wins(g.floor)}</b>
          <span className="pd-small text-muted-foreground">
            {g.floor === before[group].floor
              ? "held"
              : `from ${wins(before[group].floor)}`}
          </span>
        </div>
        <div>
          <span className="pd-mono pd-small text-muted-foreground">
            {POLES.ceiling.word}
          </span>
          <b className="pd-big block">{wins(g.ceiling.lose)}</b>
          <span className="pd-small text-muted-foreground">
            {g.ceiling.lose === before[group].ceiling.lose
              ? "held"
              : `from ${wins(before[group].ceiling.lose)}`}
          </span>
        </div>
      </div>
      <Envelope
        before={before}
        after={after}
        group={group}
        max={season.seasonLength}
        at={0.5}
      />
      <Reveal at={1.4} className="pd-card">
        <span className="pd-mono pd-small text-muted-foreground">
          {POLES.bloc.word}
        </span>
        <span className="pd-say">{blocLine(g)}</span>
      </Reveal>
      <Reveal at={2} className="pd-say">
        {ceilingLine(g)}
        {group === "conference" && after.held > g.floor
          ? ` Holding our division to its floor lifts the floor to ${wins(after.held)}.`
          : ""}
      </Reveal>
      <Reveal at={2.6} className="pd-mono pd-small flex flex-wrap gap-x-[3cqw]">
        <span>
          toward the best case{" "}
          <b className="text-success">{wins(moved.best)}</b>
        </span>
        <span>
          toward the worst{" "}
          <b className="text-destructive">{wins(moved.worst)}</b>
        </span>
      </Reveal>
    </>
  )
}

export const Division = (props: SlideProps): JSX.Element => (
  <GroupSlide {...props} group="division" />
)

export const Conference = (props: SlideProps): JSX.Element => (
  <GroupSlide {...props} group="conference" />
)

export const Results = ({ week }: SlideProps): JSX.Element => {
  const moves = movesOf(week, "conference")
  // Ours first, then what moved a pole, the forced and idle last.
  const order = (c: (typeof moves)[number]): number =>
    c.result.kind === "own" ? -1 : COHORT_ORDER.indexOf(c.cohort)
  const shown = [...moves]
    .sort((a, b) => order(a) - order(b))
    .slice(0, LIGHTS_SHOWN)
  const counts = cohortCounts(week, "conference")
  const division = cohortCounts(week, "division")
  return (
    <>
      <Kicker>Week {week.week} · the results</Kicker>
      <h2 className="pd-q">Which way did each result move us?</h2>
      <div className="pd-lights">
        {shown.map((m, i) => (
          <ResultLight
            key={`${m.result.home}-${m.result.away}`}
            noun={m.result.kind}
            cohort={m.cohort}
            label={label(m.result)}
            note={[
              COHORTS[m.cohort].verb,
              m.floor === 0 ? "" : `floor ${steps(m.floor)}`,
              m.ceiling === 0 ? "" : `ceiling ${steps(m.ceiling)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            at={0.4 + i * 0.15}
          />
        ))}
      </div>
      {(
        [
          [GROUPS.conference.word, counts],
          [GROUPS.division.word, division],
        ] as const
      ).map(([word, n], i) => (
        <Reveal
          key={word}
          at={1.8 + i * 0.3}
          className="pd-mono pd-small flex flex-wrap gap-x-[3cqw]"
        >
          <span className="text-muted-foreground">{word}</span>
          {COHORT_ORDER.map((c) => (
            <span key={c}>
              {COHORTS[c].phrase} <b>{n[c]}</b>
            </span>
          ))}
        </Reveal>
      ))}
      {cleanRun(week) ? (
        <span className="pd-badge pd-in">{CLEAN_RUN.phrase}</span>
      ) : null}
      <Reveal at={2.4} className="pd-small text-muted-foreground">
        A move is the poles as they are against the same week with that one
        result the other way. {MODEL}
      </Reveal>
    </>
  )
}
