/**
 * The week's last three questions: whose week came closest to its best (5),
 * what next week can do (6), and the call (7); then the season so far, and
 * the week in one sentence.
 */
import type { CSSProperties, JSX } from "react"
import {
  ended,
  exitLine,
  hindsight,
  hindsightLine,
  pastExit,
  seasonSpreads,
  SETTLED,
  verdictOf,
} from "@playoff-delta/lib/luck"
import {
  bandTally,
  callOf,
  kindOf,
  sentence,
  weekBand,
  worseOf100,
} from "@playoff-delta/lib/reading"
import { over } from "@playoff-delta/lib/slides"
import { percent, signed, size } from "@playoff-delta/lib/story"
import {
  CALLS,
  live,
  materialOf,
  medalOf,
  ordinal,
  phraseOf,
  STAKES,
  stakesOf,
} from "@playoff-delta/lib/words"

import { BAND_CLASS, PieceLight, priceNote } from "./marks"
import { delay, Kicker, Reveal, type SlideProps } from "./shared"

const GAME_WORDS = {
  won: "won its game",
  lost: "lost its game",
  tie: "tied its game",
  bye: "had a bye",
} as const

/** Medal cards that fit the frame; past that, ties are listed a line each. */
const CARDS = 3
const LINES = 8

export const Podium = ({ season, week }: SlideProps): JSX.Element => {
  const { medals, place, eligible } = week.podium
  const cards = medals.length <= CARDS
  const listed = cards ? medals : medals.slice(0, LINES)
  const step = cards ? 0.4 : 0.2
  return (
    <>
      <Kicker>Week {week.week} · the podium</Kicker>
      <h2 className="pd-q">Whose week came closest to its best?</h2>
      <div className="flex flex-col gap-[2cqw]">
        {listed.map((m, i) =>
          cards ? (
            <Reveal
              key={m.team}
              at={0.4 + i * step}
              className="pd-card pd-medal"
            >
              <span className="pd-mono pd-small text-muted-foreground">
                {medalOf(m.place)} · {GAME_WORDS[m.game]}
              </span>
              <span className="pd-say">
                <b>{m.team}</b>: better than <b>{worseOf100(m.rank)}</b> of
                every 100 of its ways ({percent(m.actual)}, best{" "}
                {percent(m.best)})
              </span>
              <span className="pd-mono flex flex-wrap gap-x-[2.5cqw] text-[2.6cqw]">
                {m.pieces.map((p) => (
                  <span
                    key={`${p.home}-${p.away}`}
                    className={p.made ? "text-success" : "text-destructive"}
                  >
                    {over(p.home, p.away, p.want)} {p.made ? "made" : "missed"}
                  </span>
                ))}
              </span>
            </Reveal>
          ) : (
            <Reveal
              key={m.team}
              at={0.4 + i * step}
              className="pd-mono pd-small flex justify-between gap-[2cqw]"
            >
              <span className="shrink-0 whitespace-nowrap">
                {medalOf(m.place)} · <b>{m.team}</b>
              </span>
              <span className="text-right">
                {worseOf100(m.rank)} of 100 worse · {GAME_WORDS[m.game]}
              </span>
            </Reveal>
          )
        )}
        {medals.length > listed.length ? (
          <Reveal
            at={0.4 + listed.length * step}
            className="pd-small text-muted-foreground"
          >
            and {medals.length - listed.length} more, tied
          </Reveal>
        ) : null}
      </div>
      <Reveal at={0.6 + listed.length * step} className="pd-say">
        {place === null ? (
          <>
            <b>{season.team}</b> wasn&apos;t placed: its week couldn&apos;t move
            it a point.
          </>
        ) : (
          <>
            <b>{season.team}</b> came <b>{ordinal(place)}</b> of {eligible}.
          </>
        )}
      </Reveal>
      <Reveal
        at={1 + listed.length * step}
        className="pd-small text-muted-foreground"
      >
        Each team&apos;s week, ranked among its own ways. A team is placed when
        its week could move it a point or more; equal ranks share a place.
      </Reveal>
    </>
  )
}

export const Stake = ({ season, week }: SlideProps): JSX.Element => {
  const stake = week.stake
  if (!stake) return <Kicker>Next week</Kicker>
  const stakes = STAKES[stakesOf(stake.spread)]
  const pieces = [...stake.pieces]
    .filter((p) => live(p))
    .sort((a, b) => b.price - a.price)
    .slice(0, 6)
  return (
    <>
      <Kicker>Next week</Kicker>
      <div>
        <b className="pd-big block">{stakes.phrase}</b>
        <span className="pd-say text-muted-foreground">
          ±{size(stake.spread)} points: how far next week usually moves us
          {stake.opponent === null ? ". We have a bye." : "."}
        </span>
      </div>
      <Reveal at={0.5} className="pd-small text-muted-foreground">
        Its best week needs:
      </Reveal>
      <div className="pd-lights">
        {pieces.map((p, i) => (
          <PieceLight
            key={`${p.home}-${p.away}`}
            noun={kindOf(season, p.home, p.away)}
            material={materialOf(p)}
            price={p.price}
            state="waiting"
            label={over(p.home, p.away, p.want)}
            note={priceNote(p.price)}
            at={0.8 + i * 0.2}
          />
        ))}
      </div>
      {pieces.length === 0 ? (
        <Reveal at={0.8} className="pd-say">
          Every piece next week is idle.
        </Reveal>
      ) : null}
    </>
  )
}

/** The share as a bar, with the ends where following stops marked. */
const ShareBar = ({ share }: { share: number }): JSX.Element => {
  const settled: CSSProperties & Record<"--settled", string> = {
    "--settled": `${SETTLED * 100}%`,
  }
  return (
    <div className="flex flex-col gap-[1cqw]">
      <div className="pd-bar pd-bar--settled" style={settled}>
        <i style={{ ...delay(0.5), width: `${share * 100}%` }} />
      </div>
      <div className="pd-mono text-muted-foreground flex justify-between text-[2.4cqw]">
        <span>{percent(SETTLED)}</span>
        <span>{percent(1 - SETTLED)}</span>
      </div>
    </div>
  )
}

export const Verdict = ({ season, week }: SlideProps): JSX.Element => {
  const stopped = pastExit(season, week)
  if (stopped !== null) {
    const h = hindsight(season)
    return (
      <>
        <Kicker>The call</Kicker>
        <b className="pd-big block">Stopped.</b>
        <span className="pd-say">
          We stopped watching after week {stopped}.
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
  const v = verdictOf(week)
  const call = CALLS[callOf(week)]
  return (
    <>
      <Kicker>The call</Kicker>
      <div>
        <b
          className={`pd-big block ${call.kind === "proof" ? "pd-proof" : ""}`}
        >
          {call.phrase}.
        </b>
        <span className="pd-mono pd-small text-muted-foreground">
          {call.kind === "proof" ? "proven" : "our rule"} · {call.means}
        </span>
      </div>
      <Reveal at={0.3} className="pd-say">
        {percent(week.share.after)} of the ways the season can go get us in.
        {v.kind === "exit" ? ` ${exitLine(v.why)}` : ""}
      </Reveal>
      <Reveal at={0.4}>
        <ShareBar share={week.share.after} />
      </Reveal>
    </>
  )
}

export const Season = ({ season, week }: SlideProps): JSX.Element => {
  const { weeks, bands } = bandTally(season, week)
  const spreads = seasonSpreads(weeks)
  return (
    <>
      <Kicker>The season so far</Kicker>
      <div className="pd-weeks" aria-hidden="true">
        {weeks.map((w, i) => (
          <div
            key={w.week}
            className={`pd-in pd-weeks__week ${BAND_CLASS[weekBand(w)]}`}
            style={delay(0.2 + i * 0.08)}
          >
            <span className="pd-mono">{w.week}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-[1.2cqw]">
        {bands.map((b, i) => (
          <Reveal
            key={b.band}
            at={1.2 + i * 0.15}
            className="pd-mono pd-small flex justify-between"
          >
            <span className={BAND_CLASS[b.band]}>{phraseOf(b.band)}</span>
            <span>
              <b>{b.count}</b>{" "}
              <span className="text-muted-foreground">
                (counting expects {b.expected.toFixed(1)})
              </span>
            </span>
          </Reveal>
        ))}
      </div>
      {spreads === null ? null : (
        <Reveal at={2.2} className="pd-say">
          The league alone: <b>{signed(spreads)}</b> spreads over {weeks.length}{" "}
          weeks.
        </Reveal>
      )}
    </>
  )
}

export const Outro = ({ season, week }: SlideProps): JSX.Element => {
  const over = ended(season, week)
  return (
    <>
      <div className="mt-auto flex flex-col gap-[1.5cqw]">
        <span className="pd-kicker">Week {week.week} in one line</span>
        <b className="text-[6.4cqw] leading-[1.2] font-bold text-balance">
          {sentence(season, week)}
        </b>
      </div>
      <span className="pd-kicker mt-auto">
        {over ? "That's the series" : "Next week, we drive again"}
      </span>
    </>
  )
}
