import type { JSX } from "react"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { nameOf } from "@playoff-delta/lib/story"
import { ALPHABET, SYMBOLS } from "@playoff-delta/lib/symbols"

import { Kicker, Reveal, type SlideProps } from "./shared"

export const Hook = ({ season, week }: SlideProps): JSX.Element => {
  return (
    <>
      <Kicker>The Sunday survival report</Kicker>
      <Reveal at={0.1} className="pd-teamline">
        <span>{nameOf(season, season.team)}</span>
        <b className="pd-mono">
          {week.record.w}–{week.record.l}
        </b>
      </Reveal>
      <div className="pd-hook my-auto">
        <Reveal at={0.5} className="pd-small pd-mono text-muted-foreground">
          WEEK {week.week} / THE QUESTION THAT KEEPS US HERE
        </Reveal>
        <Reveal at={1}>
          <h1 className="pd-headline">
            How much
            <br />
            hope is
            <br />
            <em>left?</em>
          </h1>
        </Reveal>
        <Reveal at={2.4} className="pd-say text-muted-foreground">
          How bad can we be, and still make the playoffs?
        </Reveal>
      </div>
      <Reveal at={3.2} className="pd-footnote">
        One team. One week. Every way still in.
      </Reveal>
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

export const Alphabet = (): JSX.Element => {
  return (
    <>
      <Kicker>The alphabet</Kicker>
      <h2 className="pd-q">Seven shapes, every story.</h2>
      <div className="grid grid-cols-2 gap-x-[3cqw] gap-y-[3cqw]">
        {ALPHABET.map((a, i) => (
          <Reveal
            key={a.label}
            at={0.3 + i * 0.3}
            className={`flex items-center gap-[2.5cqw] ${i === ALPHABET.length - 1 ? "col-span-2" : ""}`}
          >
            <SymbolGlyph
              parts={a.parts}
              hue="neutral"
              tile={false}
              viewBox={a.viewBox}
              className="size-[10cqw] shrink-0"
            />
            <span className="pd-say">{a.label}</span>
          </Reveal>
        ))}
      </div>
    </>
  )
}

export const Grammar = (): JSX.Element => {
  return (
    <>
      <Kicker>The grammar</Kicker>
      <h2 className="pd-q">Every week, the same seven things.</h2>
      <div className="flex flex-col gap-[2cqw]">
        {SYMBOLS.map((s, i) => (
          <Reveal
            key={s.key}
            at={0.3 + i * 0.25}
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
        ))}
      </div>
    </>
  )
}
