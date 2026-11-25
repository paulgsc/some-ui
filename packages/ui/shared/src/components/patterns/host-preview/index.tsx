/**
 * The living cast, previewed (HOST8, #3532): given beats, draw them. The
 * Cast wing shows each look with it, and the signature (HOST16) shows each
 * scene's proposal with it, so what either shows is what a scene renders:
 * the frame is `hostAt` (`@some-ui/styles/brand/host`), the same pure
 * function the essays' burn-ins draw.
 *
 * `HostPreview` is pure in its time: the same beats, seed and `tMs` give the
 * same picture. `useLoopTime` is the page's one loop clock
 * (`lib/loop-clock`), held still where the phone asks for less motion.
 */
import type { JSX, ReactNode } from "react"
import { useSyncExternalStore } from "react"
import { useMediaQuery } from "@some-ui/react-hooks"
import type { Area, Beat } from "@some-ui/styles/brand/host"
import { hostAt } from "@some-ui/styles/brand/host"

import type { LoopClock } from "../../../lib/loop-clock"
import {
  ANIMATION_FRAMES,
  createLoopClock,
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

/** `part` of `whole` as a CSS percentage. */
const share = (part: number, whole: number): string =>
  `${String(Math.round((part / whole) * 10_000) / 100)}%`

export type HostPreviewProps = {
  readonly beats: ReadonlyArray<Beat>
  readonly seed: number
  /** How far into the beats, in ms: `useLoopTime` for a live loop. */
  readonly tMs: number
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
  const area = areaOf(aspect)
  const frame = hostAt(beats, seed, tMs, area)
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ aspectRatio: String(aspect) }}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
    >
      {children}
      {frame !== null && (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(frame.svg)}`}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute select-none"
          style={{
            left: share(frame.box.x, area.width),
            top: share(frame.box.y, area.height),
            width: share(frame.box.width, area.width),
            height: share(frame.box.height, area.height),
            opacity: frame.opacity,
          }}
        />
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
const stillTime = (): number => STILL_MS

/**
 * The time into the page's loop, for `HostPreview`'s `tMs`: every preview on
 * the page on the same frame. Held at `STILL_MS` where the phone asks for
 * less motion, and before the page runs.
 */
export function useLoopTime(): number {
  const still = useMediaQuery("(prefers-reduced-motion: reduce)")
  return useSyncExternalStore(
    still ? holdStill : subscribeLoop,
    still ? stillTime : loopTime,
    stillTime
  )
}
