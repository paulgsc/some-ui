/**
 * Practice's lane (LA15, docs/learner-data-authority.md): what this phone
 * holds of its own record, drained by `./drain` through the one wiring
 * (`./lanes`): its finished sessions and kept shelf items, its finished
 * LeetType sessions, Studio's sittings and answers, and the soundbites'
 * records and LeetType's answer notes (`./notes`), and the grammar-lens
 * record (`./lens-record`). Its record moves
 * with the sessions the app has read (React Query's `sessionsKey`), each
 * shelf keep (`onKept`) and each write to Studio's projects, so a finished
 * session, a newly kept item or a kept take asks for a run; a LeetType
 * session finishing goes on the next ask (the app coming back, say).
 */
import { queryClient } from "@/providers/tanstack-query"
import { fnv1a, localStorageOrNull } from "@some-ui/core-utils"

import { onKept } from "@/lib/shelf-client"
import { onStudioKept, studioKeeping } from "@/lib/studio-keeping"
import { useSessions } from "@/lib/tenant"
import { sessionsKey } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

import { drainHome } from "./drain"
import { logGoing, notesGoing, readPhone, studioGoing } from "./going"
import { pairingOf, useHomeLink } from "./index"
import type { Lane, LaneCounts } from "./lanes"
import { lensGoing } from "./lens-record"
import type { HomeLinkState } from "./model"
import type { Sent } from "./sent"
import { heldCounts, readSent, sessionsToSend } from "./sent"

function cachedSessions(): ReadonlyArray<SessionRecord> {
  return queryClient.getQueryData<Array<SessionRecord>>(sessionsKey) ?? []
}

/** The sessions list's key and every key under it, as React Query hashes them. */
const SESSIONS_HASH = JSON.stringify(sessionsKey).slice(0, -1)
const isSessionsQuery = (hash: string): boolean =>
  hash.startsWith(SESSIONS_HASH)

let shelfKeeps = 0
onKept(() => {
  shelfKeeps += 1
})

let studioWrites = 0

export const practiceLane: Lane = {
  id: "practice",
  exchange: (send, { pairing }) => {
    const storage = localStorageOrNull()
    return drainHome(send, {
      read: readPhone,
      logGoing: () => logGoing(pairing, storage),
      studioGoing: () => studioGoing(pairing, storage),
      notesGoing: () => notesGoing(pairing, storage),
      lensGoing: () => lensGoing(pairing, storage),
      pairing,
      storage,
    })
  },
  revision: () =>
    fnv1a(
      [
        shelfKeeps,
        studioWrites,
        ...cachedSessions().map((s) => `${s.id}@${s.updatedAt}`),
      ].join("|")
    ),
  subscribe(listener): () => void {
    const unsubscribeShelf = onKept(listener)
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      if (isSessionsQuery(event.query.queryHash)) listener()
    })
    // A kept take is a write to its project, once Studio has handed it in.
    const onStudio = (): void => {
      studioWrites += 1
      listener()
    }
    let unsubscribeStudio: (() => void) | null = null
    const handed = (): void => {
      if (unsubscribeStudio !== null) return
      const studio = studioKeeping()
      if (studio !== null) {
        unsubscribeStudio = studio.store.subscribe(onStudio)
      }
    }
    handed()
    const unsubscribeHanded = onStudioKept(() => {
      handed()
      onStudio()
    })
    return () => {
      unsubscribeShelf()
      unsubscribeCache()
      unsubscribeHanded()
      unsubscribeStudio?.()
    }
  },
  useCounts: (): LaneCounts => {
    const link = useHomeLink()
    const { data: sessions } = useSessions()
    const held = heldByHome(link)
    const counts =
      held === null ? { sessions: 0, shelf: 0, refused: 0 } : heldCounts(held)
    return {
      held: { sessions: counts.sessions, shelf: counts.shelf },
      refused: { shelf: counts.refused },
      waiting: sessions === undefined ? 0 : sessionsWaiting(sessions, link),
      hidden: 0,
      pulled: true,
    }
  },
}

/** What this phone knows the paired home holds; nothing when unpaired. */
function heldByHome(link: HomeLinkState): Sent | null {
  const pairing = pairingOf(link)
  return pairing === null ? null : readSent(localStorageOrNull(), pairing)
}

/** Of `sessions`, how many finished ones the paired home does not hold as they are. */
function sessionsWaiting(
  sessions: ReadonlyArray<SessionRecord>,
  link: HomeLinkState
): number {
  const held = heldByHome(link)
  return held === null ? 0 : sessionsToSend(sessions, held).length
}
