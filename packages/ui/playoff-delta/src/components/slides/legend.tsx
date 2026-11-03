/**
 * The legend episode: the vocabulary, taught once (`@playoff-delta/lib/words`)
 * on the season's first table. Every weekly short then uses these words and
 * marks without teaching them again.
 */
import type { JSX } from "react"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { blocLine, legendFloor } from "@playoff-delta/lib/reading"
import { MODEL } from "@playoff-delta/lib/slides"
import { symbolFor } from "@playoff-delta/lib/symbols"
import {
  CALLS,
  CLEAN_RUN,
  COHORT_ORDER,
  COHORTS,
  COUNTDOWNS,
  OBJECTIVES,
  PIECE_ORDER,
  PIECES,
  POLES,
  STANDING_ORDER,
  STANDINGS,
} from "@playoff-delta/lib/words"

import { Envelope, Ladder, ResultLight, StandingChip } from "./marks"
import { Kicker, Reveal, type LegendProps } from "./shared"

export const Legend = (): JSX.Element => {
  return (
    <>
      <Kicker>Playoff Delta · the legend</Kicker>
      <div className="my-auto flex flex-col gap-[4cqw]">
        <Reveal at={0.2} className="text-[9cqw] leading-[1.1] font-extrabold">
          Every week, two numbers about our rivals.
        </Reveal>
        <Reveal
          at={1.2}
          className="text-muted-foreground text-[5.5cqw] font-semibold text-balance"
        >
          The best case and the worst, over every way the rest of the season can
          go, and which way the week moved us.
        </Reveal>
        <Reveal at={2.2} className="text-[6cqw] font-bold">
          First, the words.
        </Reveal>
      </div>
    </>
  )
}

export const Pieces = (): JSX.Element => {
  return (
    <>
      <Kicker>The pieces</Kicker>
      <h2 className="pd-q">A piece is a game, named by who plays.</h2>
      <div className="flex flex-col gap-[2.4cqw]">
        {PIECE_ORDER.map((k, i) => {
          const s = symbolFor(k)
          const p = PIECES[k]
          return (
            <Reveal
              key={k}
              at={0.6 + i * 0.5}
              className="grid grid-cols-[12cqw_minmax(0,1fr)] items-center gap-[3cqw]"
            >
              <SymbolGlyph
                parts={s.parts}
                hue={s.hue}
                loop
                className="size-[12cqw]"
              />
              <div>
                <b className="block text-[4.4cqw]">{p.noun}</b>
                <span className="text-muted-foreground block text-[3cqw] leading-snug">
                  {p.who} {p.moves}
                </span>
              </div>
            </Reveal>
          )
        })}
      </div>
    </>
  )
}

export const PolesLegend = ({ season }: LegendProps): JSX.Element => {
  const first = season.weeks[0]?.poles.before
  return (
    <>
      <Kicker>The poles</Kicker>
      <div className="flex flex-col gap-[1.6cqw]">
        {(["floor", "bloc", "ceiling"] as const).map((k, i) => (
          <Reveal key={k} at={0.4 + i * 0.5} className="pd-say">
            <b>{POLES[k].word}</b>: {POLES[k].means}.
          </Reveal>
        ))}
      </div>
      {first ? (
        <>
          <Envelope
            before={first}
            after={first}
            group="division"
            max={season.seasonLength}
            at={2}
          />
          <Reveal at={2.6} className="pd-card">
            <span className="pd-mono pd-small text-muted-foreground">
              before a snap
            </span>
            <span className="pd-say">{blocLine(first.division)}</span>
          </Reveal>
          <Reveal at={3.2} className="pd-small text-muted-foreground">
            {legendFloor(season)}
          </Reveal>
        </>
      ) : null}
    </>
  )
}

export const Moves = (): JSX.Element => {
  return (
    <>
      <Kicker>What a result did</Kicker>
      <h2 className="pd-q">Which way each result moved us.</h2>
      <div className="pd-lights">
        {COHORT_ORDER.map((c, i) => (
          <ResultLight
            key={c}
            noun={c === "forced" ? "inside" : "exported"}
            cohort={c}
            label={COHORTS[c].verb}
            note={
              COHORTS[c].phrase === COHORTS[c].verb
                ? undefined
                : COHORTS[c].phrase
            }
            at={0.6 + i * 0.4}
          />
        ))}
      </div>
      <div className="flex flex-col gap-[1.4cqw]">
        {COHORT_ORDER.map((c, i) => (
          <Reveal key={c} at={2.2 + i * 0.3} className="pd-say">
            <b>{COHORTS[c].phrase}</b>: {COHORTS[c].means}
          </Reveal>
        ))}
      </div>
      <Reveal at={3.6} className="pd-say">
        <b>{CLEAN_RUN.phrase}</b>: {CLEAN_RUN.means}.
      </Reveal>
    </>
  )
}

export const Objectives = (): JSX.Element => {
  return (
    <>
      <Kicker>What we play for</Kicker>
      <h2 className="pd-q">
        {OBJECTIVES.division.word}, against {OBJECTIVES.division.against};{" "}
        {OBJECTIVES.conference.word}, against {OBJECTIVES.conference.against}.
      </h2>
      <div className="flex flex-col gap-[1.6cqw]">
        {STANDING_ORDER.map((s, i) => (
          <Reveal
            key={s}
            at={0.6 + i * 0.4}
            className="flex items-center gap-[2cqw]"
          >
            <StandingChip standing={s} />
            <span className="pd-say">{STANDINGS[s].means}</span>
          </Reveal>
        ))}
      </div>
      <div className="flex flex-col gap-[1.2cqw]">
        {(["greens", "reds"] as const).map((k, i) => (
          <Reveal key={k} at={2.4 + i * 0.4} className="pd-say">
            <b>{COUNTDOWNS[k].phrase}</b>: {COUNTDOWNS[k].means}.
          </Reveal>
        ))}
      </div>
      <Reveal at={3.2} className="pd-small text-muted-foreground">
        {MODEL}
      </Reveal>
    </>
  )
}

export const Calls = (): JSX.Element => {
  return (
    <>
      <Kicker>The ladder, and the call</Kicker>
      <Ladder best="top" worst="out" at={0.4} />
      <div className="flex flex-col gap-[1.4cqw]">
        {Object.entries(CALLS).map(([k, c], i) => (
          <Reveal key={k} at={1.6 + i * 0.35} className="pd-card">
            <span className="pd-say">
              <b className={k === "keep-driving" ? "" : "pd-proof"}>
                {c.phrase}
              </b>
              : {c.means}
            </span>
          </Reveal>
        ))}
      </div>
    </>
  )
}
