import type { JSX } from "react"
import {
  ended,
  exitLine,
  exitWeek,
  followed,
  hindsight,
  hindsightLine,
  inSpreads,
  lightsOf,
  LUCK_WORDS,
  luckBand,
  seasonSpreads,
  SETTLED,
  spreadsOf,
  verdictOf,
} from "@playoff-delta/lib/luck"
import { against, nameOf, percent, size } from "@playoff-delta/lib/story"
import { counted } from "@some-ui/core-utils"

import { delay, Kicker, Reveal, type SlideProps } from "./shared"

export const Stake = ({ season, week }: SlideProps): JSX.Element => {
  const stake = week.stake
  if (!stake) return <Kicker>Next week</Kicker>
  return (
    <>
      <Kicker>Next week</Kicker>
      <div>
        <b className="pd-big block">±{size(stake.spread)}</b>
        <span className="pd-say text-muted-foreground">
          points of the ways in: how far next week usually moves us
        </span>
      </div>
      <Reveal at={0.5} className="pd-card">
        <span className="pd-mono pd-small text-muted-foreground">our game</span>
        <span className="pd-say">
          {stake.opponent === null ? (
            "A bye: only the league can move us."
          ) : stake.own > 0 ? (
            <>
              vs {stake.opponent}: <b>{size(stake.own)} points</b> between a win
              and a loss
            </>
          ) : (
            `vs ${stake.opponent}: it can't move us either way.`
          )}
        </span>
      </Reveal>
      <div className="flex flex-col gap-[2cqw]">
        {week.next.map((g, i) => (
          <Reveal
            key={`${g.home}-${g.away}`}
            at={1 + i * 0.4}
            className="pd-card"
          >
            <span className="pd-mono pd-small text-muted-foreground">
              {g.away} @ {g.home} · {size(g.swing)} points apart
            </span>
            <span className="pd-say">
              Root for the <b>{nameOf(season, g.rootFor)}</b> over the{" "}
              {nameOf(season, against(g))}
            </span>
          </Reveal>
        ))}
      </div>
      <Reveal at={2.4} className="pd-small text-muted-foreground">
        One spread: the standard deviation of our share of the ways in over the
        ways next week can go.
        {stake.exact ? "" : " Sampled."}
      </Reveal>
    </>
  )
}

/** The share as a bar, with the ends where following stops marked. */
const ShareBar = ({ share }: { share: number }): JSX.Element => (
  <div className="flex flex-col gap-[1cqw]">
    <div className="pd-bar pd-bar--settled">
      <i style={{ ...delay(0.5), width: `${share * 100}%` }} />
    </div>
    <div className="pd-mono text-muted-foreground flex justify-between text-[2.4cqw]">
      <span>{percent(SETTLED)}</span>
      <span>{percent(1 - SETTLED)}</span>
    </div>
  </div>
)

export const Verdict = ({ season, week }: SlideProps): JSX.Element => {
  const stopped = exitWeek(season)
  const v = verdictOf(week)
  if (stopped !== null && week.week > stopped) {
    const h = hindsight(season)
    return (
      <>
        <Kicker>The verdict</Kicker>
        <b className="pd-big block">Stopped.</b>
        <span className="pd-say">
          We stopped following after week {stopped}.
        </span>
        {h ? (
          <Reveal at={0.6} className="pd-card">
            <span className="pd-mono pd-small text-muted-foreground">
              in hindsight
            </span>
            <span className="pd-say">{hindsightLine(h)}</span>
          </Reveal>
        ) : null}
      </>
    )
  }
  return (
    <>
      <Kicker>The verdict</Kicker>
      <div>
        <b className="pd-big block">
          {v.kind === "watch" ? `Watch week ${week.week + 1}.` : "Exit."}
        </b>
        <span className="pd-say text-muted-foreground">
          {v.kind === "watch"
            ? `${percent(week.share.after)} of the ways the season can go get them in.`
            : `${percent(week.share.after)} of the ways in. ${exitLine(v.why)}`}
        </span>
      </div>
      <Reveal at={0.4}>
        <ShareBar share={week.share.after} />
      </Reveal>
      <Reveal at={1.2} className="pd-small text-muted-foreground">
        We follow while the share of the ways in is between {percent(SETTLED)}{" "}
        and {percent(1 - SETTLED)}, and stop for good once it leaves, or once it
        is settled either way.
      </Reveal>
    </>
  )
}

/** Spreads a week's column reaches at full height. */
const REACH = 3

export const Season = ({ season, week }: SlideProps): JSX.Element => {
  const weeks = followed(season, week)
  const spreads = seasonSpreads(weeks)
  const lit = weeks.flatMap(lightsOf)
  const made = lit.filter((l) => l.made).length
  return (
    <>
      <Kicker>The season so far</Kicker>
      <div>
        <b className="pd-big block">{LUCK_WORDS[luckBand(spreads)].big}</b>
        <span className="pd-say text-muted-foreground">
          {spreads === null
            ? "Nothing elsewhere could move us."
            : `${inSpreads(spreads)} spreads over ${counted(weeks.length, "week")} followed`}
        </span>
      </div>
      <div className="pd-strip" aria-hidden="true">
        {weeks.map((w, i) => {
          const z = spreadsOf(w) ?? 0
          const height = `${(Math.min(Math.abs(z), REACH) / REACH) * 50}%`
          return (
            <div key={w.week} className="pd-strip__week">
              <div className="pd-strip__bars">
                <i
                  className={z >= 0 ? "pd-strip__up" : "pd-strip__down"}
                  style={{ ...delay(0.3 + i * 0.08), height }}
                />
              </div>
              <span className="pd-mono text-muted-foreground text-[2.2cqw]">
                {w.week}
              </span>
            </div>
          )
        })}
      </div>
      <Reveal at={1.6} className="pd-say">
        <b>{made}</b> of {counted(lit.length, "light")} made
      </Reveal>
      <Reveal at={2} className="pd-small text-muted-foreground">
        Each week, luck averages zero. Over many weeks, the total in spreads
        usually lands within one of it.
      </Reveal>
    </>
  )
}

export const Outro = ({ season, week }: SlideProps): JSX.Element => {
  const over = ended(season, week)
  return (
    <>
      <div className="mt-auto flex flex-col gap-[1.5cqw]">
        <span className="pd-kicker">Playoff Delta</span>
        <b className="text-[13cqw] leading-[0.95] font-extrabold">
          Worth
          <br />
          following?
        </b>
      </div>
      <span className="pd-say text-muted-foreground">
        Week {week.week} · {nameOf(season, season.team)} · in{" "}
        {percent(week.share.after)} of the ways the season can go
      </span>
      <span className="pd-kicker mt-auto">
        {over ? "That's the series" : "Next week, we ask again"}
      </span>
    </>
  )
}
