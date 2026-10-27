import type { CSSProperties, JSX } from "react"
import {
  inSpreads,
  lightsOf,
  LUCK_DEFINED,
  LUCK_WORDS,
  luckBand,
  spreadsOf,
} from "@playoff-delta/lib/luck"
import { MODEL } from "@playoff-delta/lib/slides"
import {
  blewIt,
  calls,
  points,
  size,
  type StoryResult,
} from "@playoff-delta/lib/story"

import { delay, Kicker, Reveal, tone, type SlideProps } from "./shared"

/** A light's diameter, in container widths, by its share of the week's biggest. */
const diameter = (r: StoryResult, scale: number): string =>
  `${6 + 8 * (scale > 0 ? Math.sqrt(Math.abs(r.leverage) / scale) : 0)}cqw`

export const Lights = ({ season, week }: SlideProps): JSX.Element => {
  const lights = lightsOf(week)
  const league = lights.filter((l) => l.result.kind !== "own")
  const made = league.filter((l) => l.made).length
  const scale = Math.max(...lights.map((l) => Math.abs(l.result.leverage)), 0)
  const called = calls(season, week)
  const wasCalled = (r: StoryResult): boolean =>
    called.some((c) => c.result === r)
  return (
    <>
      <Kicker>Week {week.week} · the lights</Kicker>
      <h2 className="pd-q">
        {league.length
          ? `${made} made, ${league.length - made} missed.`
          : "Nothing else could move us."}
      </h2>
      <div className="pd-lights">
        {lights.map((l, i) => {
          const style: CSSProperties & Record<"--s", string> = {
            ...delay(0.3 + i * 0.15),
            "--s": diameter(l.result, scale),
          }
          const own = l.result.kind === "own"
          return (
            <div
              key={`${l.result.winner}-${l.result.loser}`}
              className="pd-light-cell"
            >
              <i
                role="img"
                aria-label={`${l.result.winner} beat ${l.result.loser}: ${l.made ? "made" : "missed"}`}
                className={`pd-light ${l.made ? "pd-light--made" : "pd-light--missed"} ${own ? "pd-light--own" : ""}`}
                style={style}
              />
              <span className="pd-mono pd-small">
                <b>{l.result.winner}</b>
                {blewIt(l.result) ? (
                  <span title="lost from ahead"> ↯</span>
                ) : null}
              </span>
              <span className="pd-mono text-muted-foreground text-[2.6cqw]">
                over {l.result.loser}
              </span>
              <b className={`pd-mono text-[2.8cqw] ${tone(l.result.leverage)}`}>
                {points(l.result.leverage)}
              </b>
              {own ? (
                <span className="pd-kicker text-[2.4cqw]">ours</span>
              ) : wasCalled(l.result) ? (
                <span className="text-muted-foreground text-[2.4cqw]">
                  called
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      <Reveal at={2.4} className="pd-small text-muted-foreground">
        A light is a result that could move our share of the ways in: green when
        it went our way, red when it didn&apos;t, bigger the further it moved
        us. Each is measured alone, so they don&apos;t add up to the week.
      </Reveal>
    </>
  )
}

/** Spreads the scale shows either side of zero. */
const REACH = 3

/** A number line in spreads, from −3 to +3, with the week's mark on it. */
const Scale = ({ spreads }: { spreads: number }): JSX.Element => {
  const at = Math.max(-REACH, Math.min(REACH, spreads))
  const left = (x: number): string => `${((x + REACH) / (2 * REACH)) * 100}%`
  return (
    <div className="pd-scale" aria-label={`${inSpreads(spreads)} spreads`}>
      {[-2, -1, 0, 1, 2].map((x) => (
        <span key={x} className="pd-scale__tick" style={{ left: left(x) }}>
          <span className="pd-mono text-muted-foreground text-[2.4cqw]">
            {x === 0 ? "0" : inSpreads(x)}
          </span>
        </span>
      ))}
      <i
        className={`pd-scale__mark ${spreads >= 0 ? "bg-success" : "bg-destructive"}`}
        style={{ ...delay(0.8), left: left(at) }}
      />
    </div>
  )
}

export const Luck = ({ season, week }: SlideProps): JSX.Element => {
  const spreads = spreadsOf(week)
  const words = LUCK_WORDS[luckBand(spreads)]
  const { share } = week
  return (
    <>
      <Kicker>Luck</Kicker>
      <div>
        <b className="pd-big block">{words.big}</b>
        <span className="pd-say text-muted-foreground">{words.line}</span>
      </div>
      {spreads === null ? null : (
        <>
          <Reveal at={0.4}>
            <Scale spreads={spreads} />
          </Reveal>
          <Reveal
            at={1.2}
            className="pd-mono pd-small flex flex-wrap gap-x-[3cqw]"
          >
            <span>
              the league{" "}
              <b className={tone(share.league)}>{points(share.league)}</b>
            </span>
            <span>a usual week ±{size(share.spread)}</span>
            <span>
              <b>{inSpreads(spreads)}</b> spreads
            </span>
          </Reveal>
        </>
      )}
      <Reveal at={1.6} className="pd-card">
        <span className="pd-mono pd-small text-muted-foreground">
          {week.game ? "our own game: our light, not luck" : "our bye"}
        </span>
        <span className="pd-say">
          {week.game ? (
            <>
              <b className={tone(share.own)}>{points(share.own)} points</b> of
              the ways in
            </>
          ) : (
            "Only the league moved us."
          )}
        </span>
      </Reveal>
      <Reveal at={2.2} className="pd-small text-muted-foreground">
        {LUCK_DEFINED} {MODEL}
        {share.exact
          ? " Every way was counted."
          : ` ${season.ways.toLocaleString("en-US")} ways sampled.`}
      </Reveal>
    </>
  )
}
