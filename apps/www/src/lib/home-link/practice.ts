/**
 * Practice's lane (LA15, docs/learner-data-authority.md): what this phone
 * holds of its own record, drained by `./drain` through the one wiring
 * (`./lanes`): its finished sessions and kept shelf items, its finished
 * LeetType sessions, Studio's sittings and answers, its written
 * reflections (LA16), its asks for the next scene (LA18), the soundbites'
 * records and LeetType's answer notes (`./notes`), and the grammar-lens
 * record (`./lens-record`). Its record moves with the sessions the app has
 * read (React Query's `sessionsKey`), each shelf keep (`onKept`), each write
 * to Studio's projects, each change to the reflections and the asks, each
 * soundbite and lens entry as last read (`./practice-reads`) and each
 * change to LeetType's answer notes, so a finished session, a newly kept
 * item, a kept take, a typed reflection, an ask, a soundbite, an answer's
 * note or a lens answer asks for a run; a LeetType session finishing goes
 * on the next ask (the app coming back, say). Its waiting count is the
 * sessions, written reflections, asks, notes and lens entries home lacks.
 * Once a run's notes part ends, the soundbites and LeetType's answer notes
 * hear what home now holds of them (`./voice-copy`'s `holdNotes`, OS1), so
 * a screen that said "full" can take one again.
 */
import { useSyncExternalStore } from "react"
import { queryClient } from "@/providers/tanstack-query"
import { fnv1a, localStorageOrNull } from "@some-ui/core-utils"

import { leetypeNotes, leetypeNotesMoved } from "@/lib/leetype-takes"
import { sceneAsks } from "@/lib/scene-ask"
import { reflections } from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"
import { onKept } from "@/lib/shelf-client"
import { onStudioKept, studioKeeping } from "@/lib/studio-keeping"
import { useSessions } from "@/lib/tenant"
import { sessionsKey } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

import { drainHome } from "./drain"
import {
  lensGoing,
  letGoHeldPrompts,
  letGoHeldReflections,
  logGoing,
  notesGoing,
  promptsGoing,
  readPhone,
  reflectionsGoing,
  studioGoing,
} from "./going"
import { pairingOf, useHomeLink } from "./index"
import type { Lane, LaneCounts } from "./lanes"
import { lensToSend } from "./lens-record"
import type { HomeLinkState } from "./model"
import { notesOf, notesToSend } from "./notes"
import { practiceRead, watchPracticeStores } from "./practice-reads"
import { promptsToSend } from "./prompts"
import { writtenToSend } from "./reflections"
import type { Sent } from "./sent"
import { heldCounts, readSent, sessionsToSend } from "./sent"
import { holdNotes } from "./voice-copy"

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
      reflectionsGoing: () => reflectionsGoing(pairing, storage),
      letGoHeld: letGoHeldReflections,
      promptsGoing: () => promptsGoing(pairing, storage),
      letGoHeldPrompts,
      notesGoing: () => notesGoing(pairing, storage),
      holdNotes,
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
        ...reflections.getSnapshot().kept.map((r) => `${r.id}@${r.createdAt}`),
        ...sceneAsks
          .kept()
          .map((p) => `${p.stamp}@${p.held === true ? "held" : "kept"}`),
        // A note never changes on the phone (`./notes`), so its id says it.
        ...practiceRead.getSnapshot().bites.map((b) => `bite:${b.id}`),
        ...leetypeNotes().map((n) => `note:${n.id}`),
        practiceRead.getSnapshot().lensAsIs,
      ].join("|")
    ),
  subscribe(listener): () => void {
    const unsubscribeShelf = onKept(listener)
    const unsubscribeReflections = reflections.subscribe(listener)
    const unsubscribeAsks = sceneAsks.subscribe(listener)
    const unsubscribeNotes = leetypeNotesMoved.subscribe(listener)
    const unsubscribeRead = practiceRead.subscribe(listener)
    const stopReads = watchPracticeStores()
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
      unsubscribeReflections()
      unsubscribeAsks()
      unsubscribeNotes()
      unsubscribeRead()
      stopReads()
      unsubscribeCache()
      unsubscribeHanded()
      unsubscribeStudio?.()
    }
  },
  useCounts: (): LaneCounts => {
    const link = useHomeLink()
    const { data: sessions } = useSessions()
    const held = heldByHome(link)
    const { kept } = useReflections()
    // Read again whenever an ask is kept or let go.
    useSyncExternalStore(sceneAsks.subscribe, sceneAsks.getSnapshot)
    const asked = sceneAsks.kept()
    // Read again whenever a soundbite, an answer's note or a lens entry moves.
    const { bites, lens } = useSyncExternalStore(
      practiceRead.subscribe,
      practiceRead.getSnapshot
    )
    useSyncExternalStore(
      leetypeNotesMoved.subscribe,
      leetypeNotesMoved.getSnapshot
    )
    const counts =
      held === null
        ? { sessions: 0, shelf: 0, refused: 0, reflections: 0, prompts: 0 }
        : heldCounts(held)
    return {
      held: {
        sessions: counts.sessions,
        shelf: counts.shelf,
        reflections: counts.reflections,
        prompts: counts.prompts,
      },
      refused: { shelf: counts.refused },
      waiting:
        (sessions === undefined ? 0 : sessionsWaiting(sessions, link)) +
        (held === null
          ? 0
          : writtenToSend(kept, held).length +
            promptsToSend(asked, held).length +
            notesToSend(notesOf(bites, leetypeNotes()), held).length +
            lensToSend(lens, held).length),
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
