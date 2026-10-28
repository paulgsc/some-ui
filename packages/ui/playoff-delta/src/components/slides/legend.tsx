/**
 * The legend episode: the vocabulary, taught once (`@playoff-delta/lib/words`).
 * Every weekly short then uses these words and marks without teaching them
 * again.
 */
import type { JSX } from "react"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { symbolFor } from "@playoff-delta/lib/symbols"
import {
  BANDS,
  CALLS,
  CLEAN_RUN,
  MATERIAL,
  PIECE_ORDER,
  PIECES,
  STAKES,
  VERBS,
  widthOf,
} from "@playoff-delta/lib/words"

import { BAND_CLASS, Bands, PieceLight } from "./marks"
import { Kicker, Reveal } from "./shared"

export const Legend = (): JSX.Element => {
  return (
    <>
      <Kicker>Playoff Delta · the legend</Kicker>
      <div className="my-auto flex flex-col gap-[4cqw]">
        <Reveal at={0.2} className="text-[9cqw] leading-[1.1] font-extrabold">
          Every week there was a best way for it to go.
        </Reveal>
        <Reveal
          at={1.2}
          className="text-muted-foreground text-[5.5cqw] font-semibold text-balance"
        >
          Each short shows how close the week came, where it broke away, and who
          came closest.
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

export const Material = (): JSX.Element => {
  const sizes = [
    { m: "major", price: 0.05 },
    { m: "minor", price: 0.005 },
    { m: "idle", price: 0 },
  ] as const
  return (
    <>
      <Kicker>What a piece is worth</Kicker>
      <h2 className="pd-q">
        Its price: how far the best week drops without it.
      </h2>
      <div className="pd-lights">
        {sizes.map(({ m, price }, i) => (
          <PieceLight
            key={m}
            noun="exported"
            material={m}
            price={price}
            state="waiting"
            label={MATERIAL[m].word}
            note={MATERIAL[m].worth}
            at={0.6 + i * 0.4}
          />
        ))}
      </div>
      <div className="flex flex-col gap-[1.6cqw]">
        {(["made", "missed", "woke"] as const).map((v, i) => (
          <Reveal key={v} at={2 + i * 0.4} className="pd-say">
            <b>{VERBS[v].word}</b>: {VERBS[v].means}
          </Reveal>
        ))}
      </div>
      <Reveal at={3.4} className="pd-small text-muted-foreground">
        A light&apos;s size is its price, on the same scale every week.
      </Reveal>
    </>
  )
}

export const BandsLegend = (): JSX.Element => {
  return (
    <>
      <Kicker>How a week went</Kicker>
      <h2 className="pd-q">
        Of the ways the week could have gone, how many would have left us worse?
      </h2>
      <Bands at={0.6} />
      <div className="flex flex-col gap-[1.2cqw]">
        {BANDS.map((b, i) => (
          <Reveal
            key={b.band}
            at={1.6 + i * 0.25}
            className="pd-mono pd-small flex justify-between"
          >
            <b className={BAND_CLASS[b.band]}>{b.phrase}</b>
            <span>{widthOf(b.band)} weeks in 100</span>
          </Reveal>
        ))}
      </div>
      <Reveal at={3.2} className="pd-say">
        <b>{CLEAN_RUN.phrase}</b>: {CLEAN_RUN.means}.
      </Reveal>
    </>
  )
}

export const Calls = (): JSX.Element => {
  return (
    <>
      <Kicker>Next week, and the call</Kicker>
      <div className="flex flex-col gap-[1.4cqw]">
        {Object.entries(STAKES).map(([k, s], i) => (
          <Reveal key={k} at={0.4 + i * 0.3} className="pd-say">
            <b>{s.phrase}</b>: {s.means}
          </Reveal>
        ))}
      </div>
      <div className="flex flex-col gap-[1.4cqw]">
        {Object.entries(CALLS).map(([k, c], i) => (
          <Reveal key={k} at={1.6 + i * 0.35} className="pd-card">
            <span className="pd-mono pd-small text-muted-foreground">
              {c.kind === "proof" ? "proven" : "our rule"}
            </span>
            <span className="pd-say">
              <b className={c.kind === "proof" ? "pd-proof" : ""}>{c.phrase}</b>
              : {c.means}
            </span>
          </Reveal>
        ))}
      </div>
    </>
  )
}
