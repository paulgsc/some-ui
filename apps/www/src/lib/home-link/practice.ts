/**
 * Practice kept on home, wired (LA11, docs/learner-data-authority.md): what
 * its person chose (`./consent-runtime`), one runtime per page load over the
 * link's `keep` running the standing send (`./kept-runtime`, `./standing`),
 * and the shared watch (`./kept-watch`) for as long as Practice's header
 * mounts `usePracticeHome`.
 *
 * The record the watch sees moves with the choice and with the sessions the
 * app has read (React Query's `sessionsKey`), so a finished session asks for
 * a send; a newly kept shelf item goes with the next ask.
 */
import { useEffect, useSyncExternalStore } from "react"
import { queryClient } from "@/providers/tanstack-query"
import { localStorageOrNull } from "@some-ui/core-utils"

import { sessionsKey } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

import type { ConsentLog } from "./consent-model"
import { SCOPES, sharedNow } from "./consent-model"
import { phoneConsent } from "./consent-runtime"
import { homeLink } from "./index"
import type { KeptState } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { createKept } from "./kept-runtime"
import type { KeptRecord } from "./kept-watch"
import { askKept, watchKept } from "./kept-watch"
import { readPhone } from "./send"
import type { Sent } from "./sent"
import { readSent, sessionsToSend } from "./sent"
import { sendStanding } from "./standing"

let home: Kept | null = null

/** One runtime per page load. */
function practiceHome(): Kept {
  home ??= createKept({
    exchange: (send) =>
      sendStanding(send, {
        read: readPhone,
        shared: () => new Set(sharedNow(phoneConsent().getSnapshot()).keys()),
        storage: localStorageOrNull(),
      }),
    keep: (run) => homeLink().keep(run),
    paired: () => homeLink().getSnapshot().link.kind === "paired",
    now: Date.now,
  })
  return home
}

function cachedSessions(): ReadonlyArray<SessionRecord> {
  return queryClient.getQueryData<Array<SessionRecord>>(sessionsKey) ?? []
}

/** A number that moves when `text` does. */
function hashOf(text: string): number {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33 + text.charCodeAt(i)) | 0
  }
  return hash
}

/** The sessions list's key and every key under it, as React Query hashes them. */
const SESSIONS_HASH = JSON.stringify(sessionsKey).slice(0, -1)
const isSessionsQuery = (hash: string): boolean =>
  hash.startsWith(SESSIONS_HASH)

/** Practice as the watch sees it (`./kept-watch`). */
const record: KeptRecord = {
  kept: () => sharedNow(phoneConsent().getSnapshot()).size > 0,
  revision: () =>
    hashOf(
      [
        phoneConsent().getSnapshot().length,
        ...cachedSessions().map((s) => `${s.id}@${s.updatedAt}`),
      ].join("|")
    ),
  subscribe(listener): () => void {
    const unsubscribeConsent = phoneConsent().subscribe(listener)
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      if (isSessionsQuery(event.query.queryHash)) listener()
    })
    return () => {
      unsubscribeConsent()
      unsubscribeCache()
    }
  },
}

/** How keeping Practice on home is going, and the watch while mounted. */
export function usePracticeHome(): KeptState {
  const current = practiceHome()
  useEffect(() => watchKept(record, practiceHome()), [])
  return useSyncExternalStore(current.subscribe, current.getSnapshot)
}

/** What its person chose, every choice in order. */
export function usePracticeConsent(): ConsentLog {
  const consent = phoneConsent()
  return useSyncExternalStore(consent.subscribe, consent.getSnapshot)
}

/** What this phone knows home holds. */
export function heldByHome(): Sent {
  return readSent(localStorageOrNull())
}

/** Of `sessions`, how many home does not hold as they are now. */
export function sessionsWaiting(
  sessions: ReadonlyArray<SessionRecord>
): number {
  return sessionsToSend(sessions, heldByHome()).length
}

/**
 * The send confirm's box, ticked and sent: Practice is kept on home from now
 * on, with `said` as the words agreed to. False when the phone would not keep
 * the choice.
 */
export function keepPracticeOnHome(said: string): boolean {
  return phoneConsent().choose({ kind: "kept", scopes: SCOPES, said })
}

/** "Stop sending": nothing new goes; home keeps what it has. */
export function stopPracticeOnHome(): boolean {
  return phoneConsent().choose({ kind: "stopped", scopes: SCOPES })
}

/** "Send now": asks for a run, as any moment the watch names would. */
export function askPractice(): void {
  askKept(record, practiceHome(), document)
}
