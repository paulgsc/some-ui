import type { JSX } from "react"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { lawOf, LAWS, type LawKey } from "@playoff-delta/lib/laws"
import { leagueResults, nameOf, points } from "@playoff-delta/lib/story"
import { symbolFor, type SymbolKey } from "@playoff-delta/lib/symbols"

import { Kicker, Reveal, tone, type SlideProps } from "./shared"

export const Hook = (): JSX.Element => {
  return (
    <>
      <Kicker>Every Sunday</Kicker>
      <div className="my-auto flex flex-col gap-[4cqw]">
        <Reveal
          at={0.2}
          className="text-muted-foreground text-[5.5cqw] font-semibold"
        >
          Most fans ask one question.
        </Reveal>
        <Reveal at={1} className="text-[10cqw] font-extrabold">
          <s className="decoration-destructive decoration-[1cqw]">
            Did we win?
          </s>
        </Reveal>
        <Reveal
          at={2}
          className="text-muted-foreground text-[5.5cqw] font-semibold"
        >
          We ask two.
        </Reveal>
        <Reveal
          at={2.8}
          className="text-[9cqw] leading-[1.1] font-extrabold text-balance"
        >
          Did following them pay this week?
        </Reveal>
        <Reveal
          at={3.8}
          className="text-muted-foreground text-[5.5cqw] font-semibold text-balance"
        >
          And is next week worth following?
        </Reveal>
      </div>
    </>
  )
}

/** The kinds of game each week's law draws. */
const GLYPHS: Readonly<Record<LawKey, ReadonlyArray<SymbolKey>>> = {
  conservation: ["exported"],
  kinds: ["game", "exported", "outside", "inside"],
  room: ["inside"],
}

export const Law = ({ season, week }: SlideProps): JSX.Element => {
  const key = lawOf(week)
  const law = LAWS[key]
  const top = leagueResults(week)[0]
  const kinds = GLYPHS[key]
  return (
    <>
      <Kicker>This week&apos;s rule</Kicker>
      <h2 className="pd-q">{law.name}</h2>
      <Reveal at={0.3} className="pd-say">
        <b>{law.rule}</b>
      </Reveal>
      <div className="flex flex-col gap-[2cqw]">
        {kinds.map((k, i) => {
          const s = symbolFor(k)
          return (
            <Reveal
              key={k}
              at={0.8 + i * 0.3}
              className="grid grid-cols-[12cqw_minmax(0,1fr)] items-center gap-[3cqw]"
            >
              <SymbolGlyph
                parts={s.parts}
                hue={s.hue}
                loop
                className="size-[12cqw]"
              />
              <div>
                <b className="block text-[3.8cqw]">{s.name}</b>
                <span className="text-muted-foreground block text-[3cqw] leading-snug">
                  {s.rule}
                </span>
              </div>
            </Reveal>
          )
        })}
      </div>
      <Reveal at={2} className="pd-say text-muted-foreground">
        {law.then}
      </Reveal>
      {top ? (
        <Reveal at={2.8} className="pd-card">
          <span className="pd-mono pd-small text-muted-foreground">
            this week
          </span>
          <span className="pd-say">
            <b>{top.winner}</b> beat {top.loser}:{" "}
            <b className={tone(top.leverage)}>{points(top.leverage)} points</b>{" "}
            for the {nameOf(season, season.team)}, against the other result
          </span>
        </Reveal>
      ) : null}
    </>
  )
}
