/**
 * Practice's lane (LA11, docs/learner-data-authority.md): its finished
 * sessions and kept shelf items, sent by the standing send (`./standing`)
 * through the one wiring (`./lanes`). Its record moves with the sessions the
 * app has read (React Query's `sessionsKey`) and each shelf keep (`onKept`),
 * so a finished session or a newly kept item asks for a send.
 */
import { queryClient } from "@/providers/tanstack-query"
import { fnv1a, localStorageOrNull } from "@some-ui/core-utils"

import { onKept } from "@/lib/shelf-client"
import { useSessions } from "@/lib/tenant"
import { sessionsKey } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

import { useHomeLink } from "./index"
import type { Lane, LaneCounts } from "./lanes"
import { pairingOf } from "./lanes"
import type { HomeLinkState } from "./model"
import { readPhone } from "./send"
import type { Sent } from "./sent"
import { heldCounts, readSent, sessionsToSend } from "./sent"
import { sendStanding } from "./standing"

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

export const practiceLane: Lane = {
  id: "practice",
  scopes: ["sessions", "shelf"],
  exchange: (send, { pairing, shared }) =>
    sendStanding(send, {
      read: readPhone,
      shared,
      pairing,
      storage: localStorageOrNull(),
    }),
  revision: () =>
    fnv1a(
      [
        shelfKeeps,
        ...cachedSessions().map((s) => `${s.id}@${s.updatedAt}`),
      ].join("|")
    ),
  subscribe(listener): () => void {
    const unsubscribeShelf = onKept(listener)
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      if (isSessionsQuery(event.query.queryHash)) listener()
    })
    return () => {
      unsubscribeShelf()
      unsubscribeCache()
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
      away: null,
      hidden: 0,
      pulled: true,
      offered: 0,
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
