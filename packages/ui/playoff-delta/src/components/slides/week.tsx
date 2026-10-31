/**
 * The week's first four questions, on its ways: the best week (1), the road
 * from best to actual in kickoff order (2), what our result left the league
 * to do (3), and the week's band among all its ways (4).
 */
import type { JSX } from "react"
import { SPREADS_DEFINED, spreadsOf } from "@playoff-delta/lib/luck"
import {
  cleanRun,
  costs,
  leagueBand,
  leagueClause,
  leaguePieces,
  LIGHTS_SHOWN,
  neededOf,
  ownPart,
  piecesOf,
  weekBand,
  woke,
  worseOf100,
  type PieceRead,
} from "@playoff-delta/lib/reading"
import { MODEL, pieceName } from "@playoff-delta/lib/slides"
import { fall, nothing, percent, signed, size } from "@playoff-delta/lib/story"
import { CLEAN_RUN, phraseOf } from "@playoff-delta/lib/words"

import { BAND_CLASS, Bands, PieceLight, priceNote, Strip } from "./marks"
import { Kicker, Reveal, type SlideProps } from "./shared"

export const Best = ({ week }: SlideProps): JSX.Element => {
  const { ways } = week
  const pieces = piecesOf(week)
  const live = neededOf(week)
  const shown = live.slice(0, LIGHTS_SHOWN)
  const more = live.length - shown.length
  const idle = pieces.length - live.length
  return (
    <>
      <Kicker>Week {week.week} · the best week</Kicker>
      <div>
        <b className="pd-big block">{percent(ways.best)}</b>
        <span className="pd-say text-muted-foreground">
          of the ways in, the best any way this week could leave us
        </span>
      </div>
      <Reveal at={0.4}>
        <Strip
          low={ways.worst}
          high={ways.best}
          rows={ways.strip.slice(0, 1)}
          marks={[
            {
              at: ways.mean[0] ?? ways.best,
              label: `now ${percent(ways.mean[0] ?? 0)}`,
              tone: "mean",
              reveal: 0.9,
            },
            {
              at: ways.best,
              label: `best ${percent(ways.best)}`,
              tone: "best",
              reveal: 1.2,
            },
          ]}
        />
      </Reveal>
      <Reveal at={1.6} className="pd-small text-muted-foreground">
        It needed:
      </Reveal>
      <div className="pd-lights">
        {shown.map((p, i) => (
          <PieceLight
            key={`${p.game.home}-${p.game.away}`}
            noun={p.game.kind}
            material={p.material}
            price={p.piece.price}
            state="waiting"
            label={pieceName(p)}
            note={priceNote(p.piece.price)}
            at={1.8 + i * 0.15}
          />
        ))}
      </div>
      <Reveal at={2.6} className="pd-small text-muted-foreground">
        {more > 0 ? `${more} more major or minor. ` : ""}
        {idle > 0
          ? `${idle} more ${idle === 1 ? "game was" : "games were"} idle. `
          : ""}
        {ways.games.length} games, so{" "}
        {Math.pow(2, ways.games.length).toLocaleString("en-US")} ways the week
        could go.
      </Reveal>
    </>
  )
}

/** A fall in red; one that rounds to nothing, plain. */
const fallClass = (drop: number): string =>
  nothing(drop) ? "" : "text-destructive"

export const Road = ({ week }: SlideProps): JSX.Element => {
  const { ways } = week
  const pieces = piecesOf(week)
  const c = costs(week)
  const step = 0.45
  const start = 0.8
  return (
    <>
      <Kicker>Week {week.week} · the road</Kicker>
      <div>
        <b className="pd-big block">
          {percent(ways.best)} → {percent(ways.actual)}
        </b>
        <span className="pd-say text-muted-foreground">
          the best week still possible, kickoff by kickoff
        </span>
      </div>
      <Strip
        low={ways.worst}
        high={ways.best}
        rows={ways.strip}
        start={start}
        step={step}
        marks={[
          {
            at: ways.best,
            label: `best ${percent(ways.best)}`,
            tone: "best",
            reveal: 0.4,
          },
          {
            at: ways.actual,
            label: `ours ${percent(ways.actual)}`,
            tone: "actual",
            reveal: start + pieces.length * step,
          },
        ]}
      />
      <div className="pd-road">
        {pieces.map((p, i) => {
          const drop = c.drops[i] ?? 0
          return (
            <PieceLight
              key={`${p.game.home}-${p.game.away}`}
              noun={p.game.kind}
              material={p.material}
              price={p.piece.price}
              state={p.made ? "made" : "missed"}
              label={p.game.winner}
              note={nothing(drop) ? "·" : fall(drop)}
              at={start + (i + 1) * step}
              compact
            />
          )
        })}
      </div>
      <Reveal
        at={start + pieces.length * step + 0.3}
        className="pd-mono pd-small flex flex-wrap gap-x-[3cqw]"
      >
        {ownPart(week) === "bye" || ownPart(week) === "tie" ? null : (
          <span>
            our light <b className={fallClass(c.own)}>{fall(c.own)}</b>
          </span>
        )}
        <span>
          the league <b className={fallClass(c.league)}>{fall(c.league)}</b>
        </span>
      </Reveal>
    </>
  )
}

export const Given = ({ week }: SlideProps): JSX.Element => {
  const part = ownPart(week)
  const band = leagueBand(week)
  const key = (p: PieceRead): string => `${p.game.home}-${p.game.away}`
  const awake = new Set(woke(week).map(key))
  const shown = [...leaguePieces(week)]
    .filter((p) => p.material !== "idle")
    .sort((a, b) => b.piece.price - a.piece.price)
    .slice(0, LIGHTS_SHOWN)
  const lead =
    part === "bye" || part === "tie"
      ? "no result of ours: the week was the league's"
      : `given our ${part === "made" ? "win" : part === "missed" ? "loss" : "result"}`
  return (
    <>
      <Kicker>Week {week.week} · the league</Kicker>
      <div>
        <span className="pd-say text-muted-foreground">{lead}, it ran</span>
        <b className={`pd-big block ${BAND_CLASS[band]}`}>
          {phraseOf(band).toLowerCase()}
        </b>
      </div>
      <Reveal at={0.5} className="pd-say">
        {leagueClause(week)}
      </Reveal>
      <div className="pd-lights">
        {shown.map((p, i) => (
          <PieceLight
            key={`${p.game.home}-${p.game.away}`}
            noun={p.game.kind}
            material={p.material}
            price={p.piece.price}
            state={p.made ? "made" : "missed"}
            label={pieceName(p)}
            note={awake.has(key(p)) ? "woke" : priceNote(p.piece.price)}
            at={1 + i * 0.2}
          />
        ))}
      </div>
    </>
  )
}

export const Rank = ({ week }: SlideProps): JSX.Element => {
  const band = weekBand(week)
  const spreads = spreadsOf(week)
  return (
    <>
      <Kicker>Week {week.week} · how it went</Kicker>
      <div>
        <b className={`pd-big block ${BAND_CLASS[band]}`}>{phraseOf(band)}</b>
        {cleanRun(week) ? (
          <span className="pd-badge pd-in">{CLEAN_RUN.phrase}</span>
        ) : null}
      </div>
      <Reveal at={0.3} className="pd-say">
        Of every 100 ways the week could have gone,{" "}
        <b>{worseOf100(week.ways.rank)}</b> would have left us worse.
      </Reveal>
      <Bands rank={week.ways.rank} at={0.6} />
      {spreads === null ? null : (
        <Reveal at={2.2} className="pd-mono pd-small">
          the league alone: <b>{signed(spreads)}</b> spreads (±
          {size(week.share.spread)} points is one)
        </Reveal>
      )}
      <Reveal at={2.6} className="pd-small text-muted-foreground">
        {SPREADS_DEFINED} {MODEL}
        {week.ways.exact
          ? " Every way was counted."
          : " The rest of the season was sampled."}
      </Reveal>
    </>
  )
}
