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
import { fnv1a, localStorageOrNull } from "@some-ui/core-utils"

import { sessionsKey } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

import type { Shared } from "./consent-model"
import { SCOPES, sharedNow } from "./consent-model"
import { phoneConsent } from "./consent-runtime"
import { homeLink, useHomeLink } from "./index"
import type { KeptState } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { createKept } from "./kept-runtime"
import type { KeptRecord } from "./kept-watch"
import { askKept, watchKept } from "./kept-watch"
import type { HomeLinkState } from "./model"
import { readPhone } from "./send"
import type { Sent } from "./sent"
import { readSent, sessionsToSend } from "./sent"
import { sendStanding } from "./standing"

let home: Kept | null = null

/** The base of the home this phone is paired with, or `null`. */
function pairedBase(
  state: HomeLinkState = homeLink().getSnapshot()
): string | null {
  return state.link.kind === "paired" ? state.link.base : null
}

/** What its person keeps sending to the paired home, as the log says now. */
function sharedWithPaired(): Shared {
  return sharedNow(phoneConsent().getSnapshot(), pairedBase())
}

/** One runtime per page load. */
function practiceHome(): Kept {
  home ??= createKept({
    exchange: (send) => {
      const base = pairedBase()
      if (base === null) return Promise.resolve({ kind: "synced" } as const)
      return sendStanding(send, {
        read: readPhone,
        shared: () =>
          new Set(sharedNow(phoneConsent().getSnapshot(), base).keys()),
        home: base,
        storage: localStorageOrNull(),
      })
    },
    keep: (run) => homeLink().keep(run),
    paired: () => homeLink().getSnapshot().link.kind === "paired",
    now: Date.now,
  })
  return home
}

function cachedSessions(): ReadonlyArray<SessionRecord> {
  return queryClient.getQueryData<Array<SessionRecord>>(sessionsKey) ?? []
}

/** The sessions list's key and every key under it, as React Query hashes them. */
const SESSIONS_HASH = JSON.stringify(sessionsKey).slice(0, -1)
const isSessionsQuery = (hash: string): boolean =>
  hash.startsWith(SESSIONS_HASH)

/** Practice as the watch sees it (`./kept-watch`). */
const record: KeptRecord = {
  kept: () => sharedWithPaired().size > 0,
  revision: () =>
    fnv1a(
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

/** What its person keeps sending to the home this phone is paired with. */
export function usePracticeShared(): Shared {
  const consent = phoneConsent()
  const log = useSyncExternalStore(consent.subscribe, consent.getSnapshot)
  return sharedNow(log, pairedBase(useHomeLink()))
}

/** What this phone knows the paired home holds; nothing when unpaired. */
export function heldByHome(link: HomeLinkState): Sent | null {
  const base = pairedBase(link)
  return base === null ? null : readSent(localStorageOrNull(), base)
}

/** Of `sessions`, how many finished ones the paired home does not hold as they are. */
export function sessionsWaiting(
  sessions: ReadonlyArray<SessionRecord>,
  link: HomeLinkState
): number {
  const held = heldByHome(link)
  return held === null ? 0 : sessionsToSend(sessions, held).length
}

/**
 * The send confirm's box, ticked and sent: Practice is kept on `home` from
 * now on, with `said` as the words agreed to. False when the phone would not
 * keep the choice.
 */
export function keepPracticeOnHome(home: string, said: string): boolean {
  return phoneConsent().choose({ kind: "kept", home, scopes: SCOPES, said })
}

/** "Stop sending": nothing new goes to the paired home; it keeps what it has. */
export function stopPracticeOnHome(): boolean {
  const home = pairedBase()
  if (home === null) return false
  return phoneConsent().choose({ kind: "stopped", home, scopes: SCOPES })
}

/** "Send now": asks for a run, as any moment the watch names would. */
export function askPractice(): void {
  askKept(record, practiceHome(), document)
}
