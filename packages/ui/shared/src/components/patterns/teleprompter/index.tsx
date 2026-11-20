/**
 * A script read aloud through the teleprompter band (IW9 #3176, shared for
 * #3269): a phrase a line in large type, the line read lit at a third of
 * the way down and the next dimmed, moving while the take under way hears
 * you and holding while it doesn't (`lib/teleprompter`). The window is an
 * ordinary scroller, so a hand can move it too, whether or not the level is
 * measured. Under it, the level, what the band is doing, Pause / Go on while
 * a take records, and the pace with Slower and Faster (C734). Every word is
 * the caller's (`TeleprompterWords`), and the caller's runtime owns the band.
 */
import type { JSX } from "react"
import { useLayoutEffect, useRef } from "react"
import { cn } from "@some-ui/core-utils"

import type { Band, BandState } from "../../../lib/teleprompter"
import { PACE_RANGE } from "../../../lib/teleprompter"
import { Button } from "../../ui/button"

/** The words the band shows, from the caller's own words table. */
export type TeleprompterWords = {
  /** The script's name, over it and for a reader. */
  readonly script: string
  /** Under the script while no take of it records. */
  readonly ready: string
  /** What the band says it is doing while a take records. */
  readonly band: Readonly<Record<BandState, string>>
  readonly pause: string
  readonly goOn: string
  readonly slower: string
  readonly faster: string
  /** The pace, as the reader set it. */
  readonly pace: (wpm: number) => string
}

/** Bars standing for the microphone's level, as the band's foot shows it. */
const LEVEL_BARS = [0.1, 0.25, 0.4, 0.55, 0.7] as const

/** Where the band sits, from the window's top: about a third of the way. */
const BAND_AT = 0.3

export const Teleprompter = ({
  lines,
  band,
  reading,
  level,
  time,
  pace,
  words,
  dataScript,
  onPause,
  onPace,
}: {
  readonly lines: ReadonlyArray<string>
  /** The band over `lines`, from `bandOf`. */
  readonly band: Band
  /** A take of this script is recording. */
  readonly reading: boolean
  /** The take's level now, 0 to 1; 0 while none records. */
  readonly level: number
  /** How long the take has run, said, while it records; null to say nothing. */
  readonly time: string | null
  readonly pace: number
  readonly words: TeleprompterWords
  /** The page's own name for the script, for its tests and links. */
  readonly dataScript?: string
  readonly onPause: () => void
  readonly onPace: (to: "slower" | "faster") => void
}): JSX.Element => {
  const windowRef = useRef<HTMLDivElement>(null)
  // What the lines say, for the effect: a new array of the same lines each
  // render moves nothing.
  const text = lines.join("\n")
  // Whether a take was being read at the last layout, so its end is seen.
  const wasReading = useRef(reading)
  // The lit line is scrolled to the band: a measure of laid-out lines, so it
  // is read after layout, again when the window changes size, and when a take
  // starts, wherever a hand left the script during the cue. A take ending
  // moves nothing (PB1): the script stays where the band, or a hand, left it.
  useLayoutEffect(() => {
    const ended = wasReading.current && !reading
    wasReading.current = reading
    const view = windowRef.current
    if (view === null) return undefined
    const place = (): void => {
      const line = view.querySelector(`[data-line="${band.line}"]`)
      if (!(line instanceof HTMLElement)) return
      view.scrollTop = line.offsetTop - view.clientHeight * BAND_AT
    }
    if (!ended) place()
    // A resize re-places the window only while a take reads it, so turning
    // the phone after a take never snaps a hand-scrolled script back (PB1).
    const onResize = (): void => {
      if (reading) place()
    }
    window.addEventListener("resize", onResize)
    return (): void => window.removeEventListener("resize", onResize)
  }, [band.line, text, reading])
  return (
    <section
      aria-label={words.script}
      {...(dataScript === undefined ? {} : { "data-script": dataScript })}
      className="bg-card flex flex-col gap-2 rounded-2xl py-3"
    >
      <p className="text-muted-foreground flex justify-between px-4 text-xs font-semibold">
        <span>{words.script}</span>
        {reading && time !== null && <span>{time}</span>}
      </p>
      <div
        ref={windowRef}
        data-scroll-intent
        className={
          /* scroll-intent: the band scrolls the script as it is read, and a hand can scroll it too, while the take records under it (#2936, IW9, #3269) */
          "relative flex h-[45vh] scroll-smooth flex-col gap-3.5 overflow-y-auto px-5 motion-reduce:scroll-auto"
        }
      >
        {/* Room above the first line and below the last, so each can sit at the band. */}
        <div aria-hidden className="h-[30%] shrink-0" />
        {lines.map((line, i) => (
          <p
            // A script can say a phrase twice; its place is its key.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            data-line={i}
            aria-current={i === band.line ? "true" : undefined}
            className={cn(
              "-mx-3 rounded-2xl px-3 py-1 text-2xl leading-snug font-bold transition-[opacity,background-color] duration-300 motion-reduce:transition-none",
              i === band.line
                ? "bg-brand/20 opacity-100"
                : i === band.line + 1
                  ? "opacity-45"
                  : "opacity-20"
            )}
          >
            {line}
          </p>
        ))}
        <div aria-hidden className="h-[70%] shrink-0" />
      </div>
      <div className="flex min-h-11 items-center gap-3 px-4">
        <span aria-hidden className="flex h-6 items-end gap-0.5">
          {LEVEL_BARS.map((bar) => (
            <i
              key={bar}
              className={cn(
                "w-1.5 rounded-sm transition-[height] duration-150 motion-reduce:transition-none",
                level >= bar ? "bg-foreground h-6" : "bg-muted-foreground h-1"
              )}
            />
          ))}
        </span>
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">
          {reading ? words.band[band.state] : words.ready}
        </p>
        {reading && (
          <Button type="button" variant="outline" onClick={onPause}>
            {band.state === "paused" ? words.goOn : words.pause}
          </Button>
        )}
      </div>
      {/* Always there, so a take starting moves nothing under the thumb (HS1). */}
      <div className="flex items-center gap-2 px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pace <= PACE_RANGE.least}
          onClick={() => onPace("slower")}
        >
          {words.slower}
        </Button>
        <p className="text-muted-foreground min-w-0 flex-1 text-center text-xs">
          {words.pace(pace)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pace >= PACE_RANGE.most}
          onClick={() => onPace("faster")}
        >
          {words.faster}
        </Button>
      </div>
    </section>
  )
}
