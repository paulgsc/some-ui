import { useEffect, useState, useSyncExternalStore } from "react"
import {
  browserClockPorts,
  createClock,
  type Clock,
  type ClockSnapshot,
} from "@burn-ins/runtime/clock"

export type PreviewClock = ClockSnapshot &
  Pick<Clock, "play" | "pause" | "seek">

/**
 * The preview's clock for one mount (`runtime/clock`), paused on unmount.
 * `initialAtMs` is read once, where the page opens.
 */
export function usePreviewClock(initialAtMs = 0): PreviewClock {
  const [clock] = useState(
    (): Clock => createClock(browserClockPorts, initialAtMs)
  )
  useEffect(() => (): void => clock.pause(), [clock])
  const snapshot = useSyncExternalStore(clock.subscribe, clock.getSnapshot)
  return {
    ...snapshot,
    play: clock.play,
    pause: clock.pause,
    seek: clock.seek,
  }
}
