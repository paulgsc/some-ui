import { useEffect, useEffectEvent, useSyncExternalStore } from "react"

import type { ActivityHost, HostHoldTarget } from "./host-hold"
import { followHost } from "./host-hold"

const NEVER = (): boolean => false
const NOTHING = (): (() => void) => () => undefined

/**
 * Wiring only: the one way an activity follows its session's hold. With a
 * `target` (the activity's runtime), forwards each hold and release to it
 * while mounted (`followHost`); either way, answers whether the host waits
 * now, for rendering. With no host the activity plays on its own: never
 * held, and the target is released once.
 */
export function useHostHold(
  host: ActivityHost | undefined,
  target?: HostHoldTarget
): boolean {
  const hold = useEffectEvent((): void => target?.hold())
  const release = useEffectEvent((): void => target?.release())
  useEffect(() => {
    const forward = {
      hold: (): void => hold(),
      release: (): void => release(),
    }
    if (host) return followHost(host, forward)
    forward.release()
    return undefined
  }, [host])
  return useSyncExternalStore(
    host?.subscribe ?? NOTHING,
    host?.held ?? NEVER,
    host?.held ?? NEVER
  )
}
