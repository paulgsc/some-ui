import type { JSX } from "react"
import {
  claimOf,
  floorRecord,
  nameOf,
  type StoryClaim,
} from "@playoff-delta/lib/story"

import { delay, Kicker, Reveal, type SlideProps } from "./shared"

/** A floor as a share of the season; out fills the bar. */
const barWidth = (c: StoryClaim, seasonLength: number): number =>
  c.in ? ((c.wins + c.extraWins) / seasonLength) * 100 : 100

export const Rivals = ({ season, week }: SlideProps): JSX.Element => {
  const label = (c: StoryClaim): string =>
    c.in ? `${floorRecord(c, season.seasonLength)} · #${c.seed}` : "OUT"
  const n = week.rivals.length
  return (
    <>
      <Kicker>The rivals</Kicker>
      <h2 className="pd-q">How close to rock bottom?</h2>
      <div className="flex flex-col gap-[3cqw]">
        {week.rivals.map((r, i) => {
          const at = 0.3 + i * 1.2
          return (
            <Reveal key={r.team} at={at} className="pd-card">
              <div className="flex items-baseline justify-between">
                <b className="text-[5cqw]">{nameOf(season, r.team)}</b>
                <span
                  className={`pd-mono pd-small font-bold ${r.game.won ? "text-destructive" : "text-success"}`}
                >
                  {r.game.won ? "W" : "L"} vs {r.game.opponent}
                </span>
              </div>
              {[
                { k: "last week", c: r.before, cls: "" },
                { k: "now", c: r.after, cls: "" },
                {
                  k: "each break reversed",
                  c: r.worst,
                  cls: "text-muted-foreground",
                },
              ].map(({ k, c, cls }) => (
                <div key={k} className="pd-small flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <b className={cls}>{label(c)}</b>
                </div>
              ))}
            </Reveal>
          )
        })}
      </div>
      <Reveal
        at={0.3 + n * 1.2}
        className="mt-auto grid grid-cols-2 gap-[3cqw]"
      >
        <div className="flex flex-col">
          <span className="pd-mono text-muted-foreground text-[2.6cqw]">
            futility points this week
          </span>
          <b className="text-[7cqw]">
            {week.points.week.scored}
            <small className="text-muted-foreground text-[3.6cqw]">
              {" "}
              of {week.points.week.possible}
            </small>
          </b>
        </div>
        <div className="flex flex-col">
          <span className="pd-mono text-muted-foreground text-[2.6cqw]">
            this season
          </span>
          <b className="text-[7cqw]">
            {week.points.season.scored}
            <small className="text-muted-foreground text-[3.6cqw]">
              {" "}
              of {week.points.season.possible}
            </small>
          </b>
        </div>
      </Reveal>
    </>
  )
}

export const Collisions = ({ week }: SlideProps): JSX.Element => {
  return (
    <>
      <Kicker>The collisions</Kicker>
      <h2 className="pd-q">Where rooting gets messy.</h2>
      <div className="flex flex-col gap-[2.5cqw]">
        {week.collisions.slice(0, 4).map((c, i) => (
          <Reveal
            key={`${c.home}-${c.away}-${c.kind === "rival-vs-you" ? c.rival : "both"}`}
            at={0.3 + i * 0.5}
            className="pd-card border-dashed"
          >
            <span className="pd-mono pd-small text-muted-foreground">
              {c.away} @ {c.home} · {c.winner} won
            </span>
            {c.kind === "rival-vs-rival" ? (
              <span className="pd-say text-destructive">
                Two rivals. One of them had to win.
              </span>
            ) : (
              <>
                <span className="pd-say text-destructive">
                  worst for {c.rival}: <b>{c.worstForRival} wins</b>
                </span>
                <span className="pd-say text-success">
                  best for you: <b>{c.bestForYou} wins</b>
                </span>
              </>
            )}
          </Reveal>
        ))}
      </div>
    </>
  )
}

export const Benchmark = ({ season, week }: SlideProps): JSX.Element => {
  const me = claimOf(week.paths.after, week.paths.winsAfter)
  const low = week.benchmark.lowestBar
  const rows: ReadonlyArray<{
    label: string
    sub: string
    c: StoryClaim
    mine?: boolean
  }> = [
    { label: "You", sub: `after week ${week.week}`, c: me, mine: true },
    {
      label: "You, last season",
      sub: `after week ${week.week}`,
      c: week.benchmark.lastSeason,
    },
    {
      label: `Lowest bar · ${low.team}`,
      sub: nameOf(season, low.team),
      c: { in: true, wins: low.wins, extraWins: 0, seed: low.seed },
    },
  ]
  return (
    <>
      <Kicker>The benchmark</Kicker>
      <h2 className="pd-q">How low is the bar?</h2>
      <div className="flex flex-col gap-[3cqw]">
        {rows.map((r, i) => {
          const at = 0.5 + i * 1.1
          return (
            <Reveal
              key={r.label}
              at={at}
              className="flex flex-col gap-[1.5cqw]"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-[2cqw]">
                <b className={`text-[4.2cqw] ${r.mine ? "text-success" : ""}`}>
                  {r.label}
                </b>
                <span className="pd-small text-muted-foreground truncate">
                  {r.sub}
                </span>
                <b className="pd-mono text-[4.2cqw]">
                  {r.c.in ? floorRecord(r.c, season.seasonLength) : "OUT"}
                </b>
              </div>
              <div className={`pd-bar ${r.mine ? "" : "pd-bar--neutral"}`}>
                <i
                  style={{
                    ...delay(at + 0.2),
                    width: `${barWidth(r.c, season.seasonLength)}%`,
                  }}
                />
              </div>
            </Reveal>
          )
        })}
      </div>
      <Reveal at={3.8} className="pd-say text-muted-foreground">
        Shorter is better: the fewest wins that can still get in.
      </Reveal>
    </>
  )
}

export const Outro = ({ season, week }: SlideProps): JSX.Element => {
  const a = claimOf(week.paths.after, week.paths.winsAfter)
  return (
    <>
      <div className="mt-auto flex flex-col gap-[1.5cqw]">
        <span className="pd-kicker">Playoff Delta</span>
        <b className="text-[13cqw] leading-[0.95] font-extrabold">
          How bad
          <br />
          can we be?
        </b>
      </div>
      <span className="pd-say text-muted-foreground">
        Week {week.week} · {nameOf(season, season.team)} · floor{" "}
        {floorRecord(a, season.seasonLength)}
        {a.in ? ` · #${a.seed}` : ""}
      </span>
      <span className="pd-say text-muted-foreground">
        futility points: {week.points.season.scored} of{" "}
        {week.points.season.possible}
      </span>
      <span className="pd-kicker mt-auto">Next week, we ask again</span>
    </>
  )
}
