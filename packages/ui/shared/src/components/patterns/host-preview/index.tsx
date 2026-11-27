/**
 * The living cast, previewed (HOST8, #3532): given beats, draw them. The
 * Cast wing shows each look with it, and the signature (HOST16) shows each
 * scene's proposal with it, so what either shows is what a scene renders:
 * the frame is `hostAt` (`@some-ui/styles/brand/host`), the same pure
 * function the essays' burn-ins draw.
 *
 * `HostPreview` is pure in its time: the same beats, seed and `tMs` give the
 * same picture. It draws the frame's drawing inline (`drawNodes`), under ids
 * of its own, so a frame changes elements in place rather than handing the
 * page a new image to decode (C1612). `useLoopTime` is the page's one
 * loop clock (`lib/loop-clock`), held still where the phone asks for less
 * motion.
 */
import type { JSX, ReactNode } from "react"
import { useId, useSyncExternalStore } from "react"
import { useMediaQuery } from "@some-ui/react-hooks"
import type { Area, Beat } from "@some-ui/styles/brand/host"
import { hostAt, idleAt } from "@some-ui/styles/brand/host"

import { drawNodes } from "../../../lib/draw-nodes"
import type { LoopClock } from "../../../lib/loop-clock"
import {
  ANIMATION_FRAMES,
  createLoopClock,
  FRAME_MS,
  LOOP_MS,
  STILL_MS,
} from "../../../lib/loop-clock"
import { cn } from "../../../lib/utils"

/** The preview's own area: its height is 100 units, its width the aspect's share. */
const UNITS = 100

/** The area `hostAt` draws over, for a box of `aspect` (width over height). */
const areaOf = (aspect: number): Area => ({
  x: 0,
  y: 0,
  width: UNITS * aspect,
  height: UNITS,
})

/**
 * Where a still preview of `seed` holds: the first frame from `STILL_MS`
 * whose eyes are open, since a blink's schedule is the seed's own.
 */
export function stillFor(seed: number): number {
  for (let t = STILL_MS; t < STILL_MS + LOOP_MS; t += FRAME_MS) {
    const at = Math.round(t)
    if (idleAt(seed, at).blink === 0) return at
  }
  return STILL_MS
}

/** A preview's time: ms into its beats, or held still where the phone asks for less motion. */
export type PreviewTime = number | "still"

/** `part` of `whole` as a CSS percentage. */
const share = (part: number, whole: number): string =>
  `${String(Math.round((part / whole) * 10_000) / 100)}%`

export type HostPreviewProps = {
  readonly beats: ReadonlyArray<Beat>
  readonly seed: number
  /** How far into the beats, in ms, or held still: `useLoopTime` for a live loop. */
  readonly tMs: PreviewTime
  /** The box's width over its height: 1 for a square, 16 / 9 for a card. */
  readonly aspect?: number
  /** What the host stands over: a sample card, or nothing. */
  readonly children?: ReactNode
  /** What the picture shows, for a screen reader; unsaid when the words beside it say it. */
  readonly label?: string
  readonly className?: string
}

/** The host at `tMs` over `children`, placed as a scene places it. */
export const HostPreview = ({
  beats,
  seed,
  tMs,
  aspect = 1,
  children,
  label,
  className,
}: HostPreviewProps): JSX.Element => {
  const ids = useId().replace(/[^A-Za-z0-9]/g, "")
  const area = areaOf(aspect)
  const frame = hostAt(
    beats,
    seed,
    tMs === "still" ? stillFor(seed) : tMs,
    area
  )
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ aspectRatio: String(aspect) }}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
    >
      {children}
      {frame !== null && (
        <div
          aria-hidden
          data-host-frame=""
          className="pointer-events-none absolute select-none [&>svg]:block [&>svg]:size-full"
          style={{
            left: share(frame.box.x, area.width),
            top: share(frame.box.y, area.height),
            width: share(frame.box.width, area.width),
            height: share(frame.box.height, area.height),
            opacity: frame.opacity,
          }}
        >
          {drawNodes([frame.drawing], { idPrefix: ids })}
        </div>
      )}
    </div>
  )
}

/** The page's one loop clock, made when a preview first needs it. */
let pageClock: LoopClock | null = null
const clock = (): LoopClock => (pageClock ??= createLoopClock(ANIMATION_FRAMES))

const subscribeLoop = (listener: () => void): (() => void) =>
  clock().subscribe(listener)
const loopTime = (): number => clock().getTime()
const holdStill = (): (() => void) => () => undefined
const stillTime = (): PreviewTime => "still"

/**
 * The time into the page's loop, for `HostPreview`'s `tMs`: every preview on
 * the page on the same frame, starting over every `LOOP_MS`, so it suits a
 * look's idle loop, not a run of beats longer than that. Held still where
 * the phone asks for less motion, and before the page runs.
 */
export function useLoopTime(): PreviewTime {
  const still = useMediaQuery("(prefers-reduced-motion: reduce)")
  return useSyncExternalStore<PreviewTime>(
    still ? holdStill : subscribeLoop,
    still ? stillTime : loopTime,
    stillTime
  )
}
