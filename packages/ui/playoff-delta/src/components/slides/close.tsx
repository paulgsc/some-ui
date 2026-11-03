/**
 * The week's last readings: where each objective stands and how far it is
 * from changing (4), the ladder and the call (5); then the season so far, and
 * the week in one sentence.
 */
import type { JSX } from "react"
import {
  callOf,
  capital,
  ended,
  followed,
  greensOf,
  ladderOf,
  redsOf,
  sentence,
  standingOf,
} from "@playoff-delta/lib/reading"
import { wins } from "@playoff-delta/lib/story"
import {
  CALLS,
  COUNTDOWNS,
  GROUPS,
  OBJECTIVES,
  POLES,
  STANDINGS,
} from "@playoff-delta/lib/words"

import { Ladder, StandingChip } from "./marks"
import { delay, Kicker, Reveal, type SlideProps } from "./shared"

export const Standings = ({ week }: SlideProps): JSX.Element => {
  const { before, after } = week.poles
  return (
    <>
      <Kicker>Week {week.week} · where we stand</Kicker>
      <div className="flex flex-col gap-[3cqw]">
        {(["division", "conference"] as const).map((key, i) => {
          const now = standingOf(after, key)
          const was = standingOf(before, key)
          const settled = now === "clinched" || now === "out"
          return (
            <Reveal key={key} at={0.4 + i * 0.8} className="pd-card">
              <span className="pd-mono pd-small text-muted-foreground">
                {OBJECTIVES[key].word} · against {OBJECTIVES[key].against}
              </span>
              <span>
                <StandingChip standing={now} />
                {was === now ? null : (
                  <span className="pd-small text-muted-foreground">
                    {" "}
                    was {STANDINGS[was].phrase.toLowerCase()}
                  </span>
                )}
              </span>
              <span className="pd-say">{capital(STANDINGS[now].means)}.</span>
              {settled ? null : (
                <span className="pd-mono pd-small flex flex-wrap gap-x-[3cqw]">
                  <span>
                    <b className="text-success">{wins(greensOf(after, key))}</b>{" "}
                    {COUNTDOWNS.greens.phrase}
                  </span>
                  <span>
                    <b className="text-destructive">
                      {wins(redsOf(after, key))}
                    </b>{" "}
                    {COUNTDOWNS.reds.phrase}
                  </span>
                </span>
              )}
            </Reveal>
          )
        })}
      </div>
    </>
  )
}

export const LadderSlide = ({ week }: SlideProps): JSX.Element => {
  const { best, worst } = ladderOf(week.poles.after)
  const call = CALLS[callOf(week)]
  return (
    <>
      <Kicker>Week {week.week} · the ladder</Kicker>
      <h2 className="pd-q">How high can we still finish, and how low?</h2>
      <Ladder best={best} worst={worst} at={0.4} />
      <Reveal at={1.6} className="pd-card">
        <span className="pd-mono pd-small text-muted-foreground">the call</span>
        <span className="pd-say">
          <b className={callOf(week) === "keep-driving" ? "" : "pd-proof"}>
            {call.phrase}
          </b>
          : {call.means}
        </span>
      </Reveal>
    </>
  )
}

/** The envelope closing week by week: one column a week, floor up to ceiling. */
export const Season = ({ season, week }: SlideProps): JSX.Element => {
  const weeks = followed(season, week)
  const max = season.seasonLength
  const y = (x: number): string => `${100 - (x / max) * 100}%`
  return (
    <>
      <Kicker>
        {season.label} · {weeks.length} {weeks.length === 1 ? "week" : "weeks"}{" "}
        followed
      </Kicker>
      <h2 className="pd-q">The envelope, closing.</h2>
      {(["division", "conference"] as const).map((key, k) => (
        <div key={key} className="flex flex-col gap-[1cqw]">
          <span className="pd-mono pd-small text-muted-foreground">
            {GROUPS[key].word}: {POLES.floor.word} up, {POLES.ceiling.word}{" "}
            down, ours between
          </span>
          <svg className="pd-season h-[26cqw] w-full" aria-hidden="true">
            {weeks.map((w, i) => {
              const p = w.poles.after
              // Side by side in the week's slot: the rivals right, ours left.
              const at = (shift: number): string =>
                `${((i + 0.5 + shift) / weeks.length) * 100}%`
              return (
                <g
                  key={w.week}
                  className="pd-in"
                  style={delay(0.3 + k * 0.6 + i * 0.05)}
                >
                  <line
                    className="pd-season__rivals"
                    x1={at(0.15)}
                    x2={at(0.15)}
                    y1={y(p[key].floor)}
                    y2={y(p[key].ceiling.lose)}
                  />
                  <line
                    className="pd-season__us"
                    x1={at(-0.15)}
                    x2={at(-0.15)}
                    y1={y(p.us.low)}
                    y2={y(p.us.high)}
                  />
                </g>
              )
            })}
          </svg>
        </div>
      ))}
      <Reveal at={1.8} className="pd-small text-muted-foreground">
        Each column is a week: the rivals&apos; floor to ceiling, and our wins
        from losing out to winning out.
      </Reveal>
    </>
  )
}

export const Outro = ({ season, week }: SlideProps): JSX.Element => {
  const last = ended(season, week)
  return (
    <>
      <Kicker>Week {week.week} · in one line</Kicker>
      <div className="my-auto flex flex-col gap-[3cqw]">
        <Reveal at={0.2} className="text-[6.4cqw] leading-tight font-bold">
          {sentence(week)}
        </Reveal>
        <Reveal at={1.4} className="pd-say text-muted-foreground">
          {last ? "That's the series." : "Next week, we drive again."}
        </Reveal>
      </div>
    </>
  )
}
