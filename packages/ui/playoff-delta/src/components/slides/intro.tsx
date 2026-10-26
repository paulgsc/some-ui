import type { JSX } from "react"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { lawOf, LAWS } from "@playoff-delta/lib/laws"
import { leagueResults, nameOf, points } from "@playoff-delta/lib/story"
import { symbolFor, type SymbolKey } from "@playoff-delta/lib/symbols"

import { Kicker, Reveal, type SlideProps } from "./shared"

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
          How bad can we be, and still make the playoffs?
        </Reveal>
        <Reveal
          at={3.8}
          className="text-muted-foreground text-[5.5cqw] font-semibold text-balance"
        >
          And of all the ways the season can still go, how many get us in?
        </Reveal>
      </div>
    </>
  )
}

export const Test = ({ season, week }: SlideProps): JSX.Element => {
  const { w, l } = week.record
  const capped = `${w}–${season.seasonLength - w}`
  return (
    <>
      <Kicker>The test</Kicker>
      <h2 className="pd-q">Freeze the season.</h2>
      <Reveal at={0.4} className="pd-card self-start">
        <span className="pd-small text-muted-foreground">
          {nameOf(season, season.team)} now
        </span>
        <b className="pd-big pd-mono">
          {w}–{l}
        </b>
      </Reveal>
      <Reveal
        at={1}
        className="pd-mono text-muted-foreground pd-small pl-[1.5cqw]"
      >
        never win again →
      </Reveal>
      <Reveal at={1.5} className="pd-card border-destructive/60 self-start">
        <span className="pd-small text-muted-foreground">final record</span>
        <b className="pd-big pd-mono text-destructive">{capped}</b>
      </Reveal>
      <Reveal at={2.3} className="pd-q">
        Can a {capped} team still make the playoffs?
      </Reveal>
    </>
  )
}

export const Law = ({ season, week }: SlideProps): JSX.Element => {
  const key = lawOf(week)
  const law = LAWS[key]
  const top = leagueResults(week)[0]
  const kinds: ReadonlyArray<SymbolKey> =
    key === "kinds"
      ? ["game", "exported", "outside", "inside"]
      : [key === "conservation" ? "exported" : "inside"]
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
            <b
              className={
                top.leverage >= 0 ? "text-success" : "text-destructive"
              }
            >
              {points(top.leverage)} points
            </b>{" "}
            for the {nameOf(season, season.team)}, against the other result
          </span>
        </Reveal>
      ) : null}
    </>
  )
}
