/**
 * The session an activity plays inside, as the activity sees it: whether it
 * waits now, and the activity's place in its scene, kept for the next mount
 * of the player. A host (apps/www's session player) makes one per scene from
 * the session's playback port (`lib/session-stop/activity-host`); a panel
 * rendered with none plays on its own and keeps nothing.
 *
 * Promise SS2 (apps/www's `lib/session-stop`, "Inside a session, each
 * activity follows it"): every activity a session plays follows its hold
 * through this port, with `useHostHold` as the only wiring, and keeps its
 * place through `recall` and `keep`.
 */
export type ActivityHost = {
  /**
   * Whether the session waits: paused by the person, by a stop (leaving
   * included), or held by the reflection drawer. An activity waits with it.
   */
  held: () => boolean
  /** Told when `held` may have changed. */
  subscribe: (listener: () => void) => () => void
  /**
   * What this activity kept under `key` on an earlier mount of the player
   * in this scene of this session, unvalidated; undefined when nothing was.
   * A session started over, or ended, has nothing to recall.
   */
  recall: (key: string) => unknown
  /** Keeps `place` under `key`, for the next mount in this scene. */
  keep: (key: string, place: unknown) => void
}

/** What waits with the host: each call says which way it moved. */
export type HostHoldTarget = {
  /** The host waits. Called again while held, it does nothing. */
  hold: () => void
  /** The host plays. Called while not held, it does nothing. */
  release: () => void
}

/**
 * Forwards the host's hold to `target` until the returned cleanup: the
 * state at once (so a target connected again, as React's StrictMode does,
 * catches up on what it missed meanwhile), then each change. Both of the
 * target's calls must be idempotent.
 */
export function followHost(
  host: ActivityHost,
  target: HostHoldTarget
): () => void {
  let held = host.held()
  if (held) target.hold()
  else target.release()
  return host.subscribe(() => {
    const now = host.held()
    if (now === held) return
    held = now
    if (now) target.hold()
    else target.release()
  })
}
