import { isRecord } from "@some-ui/core-utils"
import type { ActivityHost } from "@some-ui/react-hooks"

import { boundedList } from "@/lib/bounded-list"
import { useOrchestratorStore } from "@/lib/orchestrator"

import type { Playback } from "./runtime"

/**
 * The session as each activity inside it sees it (`ActivityHost`,
 * `@some-ui/react-hooks`): made once per player mount, from the same
 * playback port a stop and the reflection drawer drive (`./playback`), so
 * whatever holds the session holds every activity in it, and no activity
 * keeps a copy of the rule.
 *
 * An activity is held while the session is paused underneath: by the person,
 * by a stop (leaving included), or by the drawer's hold. That is `base`, the
 * orchestrator itself, not `holdable`'s port, which tells a stop a held
 * session still plays.
 *
 * Its place is kept per session and scene, on this device, until the
 * session starts over from its beginning or ends (`forgetting`), so the
 * player reopened on a stop picks each activity up where it was.
 *
 * Promise SS2, held by `__tests__/stop-resume.test.ts` (this port, across
 * SS1's whole Family) and each activity's own test (that it follows this
 * port): inside a session, each activity waits while the session waits and
 * keeps its place across the player closing and reopening.
 */

/** Where each activity's place is kept, by session, scene and key. */
export type ActivityPlaces = {
  recall: (sessionId: string, scene: string, key: string) => unknown
  keep: (sessionId: string, scene: string, key: string, place: unknown) => void
  /** Every place the session's activities kept. */
  forget: (sessionId: string) => void
}

type KeptPlaces = {
  sessionId: string
  /** By scene id, then by the activity's key. */
  places: Record<string, Record<string, unknown>>
}

/** As many sessions as keep a stop (`STOP_LIMIT`): only those resume. */
const PLACE_LIMIT = 20

const kept = boundedList(
  "some-ui:activity-places",
  PLACE_LIMIT,
  (value): value is KeptPlaces =>
    isRecord(value) &&
    typeof value.sessionId === "string" &&
    isRecord(value.places) &&
    Object.values(value.places).every(isRecord)
)

const ofSession =
  (sessionId: string) =>
  (item: KeptPlaces): boolean =>
    item.sessionId === sessionId

/**
 * In `localStorage`, beside the session's stops: a place is working state
 * for a resume, not part of the person's record, and an older session's
 * places give way to a newer one's.
 */
export const storedPlaces: ActivityPlaces = {
  recall: (sessionId, scene, key) =>
    kept.read().find(ofSession(sessionId))?.places[scene]?.[key],
  keep: (sessionId, scene, key, place) => {
    const was = kept.read().find(ofSession(sessionId))?.places ?? {}
    const places = { ...was, [scene]: { ...was[scene], [key]: place } }
    kept.put({ sessionId, places }, ofSession(sessionId))
  },
  forget: (sessionId) => {
    if (kept.read().some(ofSession(sessionId))) {
      kept.remove(ofSession(sessionId))
    }
  },
}

/** Tells `listener` whenever the session's playback may have changed. */
export type PlaybackWatch = (listener: () => void) => () => void

export const orchestratorWatch: PlaybackWatch = (listener) =>
  useOrchestratorStore.subscribe(listener)

export type ActivityHosts = {
  /** The host for the activities of one scene, by its `scene_id`. */
  forScene: (scene: string) => ActivityHost
  /**
   * `playback`, which also forgets every place as the session starts from
   * its beginning (`start`) or ends. A restart at a stop keeps them.
   */
  forgetting: (playback: Playback) => Playback
}

export function createActivityHosts(
  sessionId: string,
  base: Playback,
  watch: PlaybackWatch,
  places: ActivityPlaces = storedPlaces
): ActivityHosts {
  const held = (): boolean => base.position()?.playing === false
  const subscribe = (listener: () => void): (() => void) => {
    let was = held()
    return watch(() => {
      const now = held()
      if (now === was) return
      was = now
      listener()
    })
  }
  const hosts = new Map<string, ActivityHost>()

  return {
    forScene: (scene): ActivityHost => {
      const known = hosts.get(scene)
      if (known) return known
      const host: ActivityHost = {
        held,
        subscribe,
        recall: (key): unknown => places.recall(sessionId, scene, key),
        keep: (key, place): void => places.keep(sessionId, scene, key, place),
      }
      hosts.set(scene, host)
      return host
    },
    forgetting: (playback) => ({
      ...playback,
      start: (): void => {
        places.forget(sessionId)
        playback.start()
      },
      end: (): void => {
        playback.end()
        places.forget(sessionId)
      },
    }),
  }
}
