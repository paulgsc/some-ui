/**
 * What this phone holds for the drain (`./drain`): its sessions and kept
 * shelf items, its finished LeetType sessions, Studio's sittings and
 * answers, and the study notes (`./notes`), each read from the phone alone,
 * and all but the first two already narrowed to what home does not hold as
 * it is now (`./sent`).
 * Nothing here sends.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import type { HomeSession } from "@some-ui/leetype"

import { deviceBackend } from "@/lib/device-backend/boot"
import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { everyKept } from "@/lib/device-backend/handlers/shelf"
import { soundbiteKeeping } from "@/lib/soundbite-keeping"
import { studioKeeping } from "@/lib/studio-keeping"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

import type { StudyNote } from "./notes"
import { notesOf, notesToSend } from "./notes"
import { logToSend, readSent } from "./sent"
import type { StudioGoing } from "./studio-log"
import { reportsOf, studioToSend } from "./studio-log"

/** This phone's sessions and kept items. Reads only this phone. */
export async function readPhone(): Promise<{
  local: Array<SessionRecord>
  kept: Array<Kept>
}> {
  const local = await sessionsRepository.list()
  const { context } = await deviceBackend()
  return { local, kept: await everyKept(context.db) }
}

/**
 * What a run under `pairing` carries of this phone's finished LeetType
 * sessions, in their home form: what home doesn't hold as it is now; none
 * when the session log can't be read. Reads only this phone.
 */
export async function logGoing(
  pairing: string,
  storage: KeyedStorage | null
): Promise<Array<HomeSession>> {
  const { createSessionLogStore, finishedSessions } = await import(
    "@some-ui/leetype"
  )
  const store = createSessionLogStore()
  if (store.readOnly) return []
  return logToSend(
    finishedSessions(store.getSnapshot().log),
    readSent(storage, pairing)
  )
}

/**
 * What a run under `pairing` carries of Studio's time log and answers:
 * what home doesn't hold as it is now. Reads only this phone.
 */
export async function studioGoing(
  pairing: string,
  storage: KeyedStorage | null
): Promise<StudioGoing> {
  const studio = studioKeeping()
  if (studio === null) return { sittings: [], reports: [] }
  const [list, friction] = await Promise.all([
    studio.store.list(),
    studio.store.friction(),
  ])
  return studioToSend(
    studio.timeLog(),
    reportsOf(friction, list, studio.sittingKey),
    readSent(storage, pairing)
  )
}

/**
 * What a run under `pairing` carries of the soundbites' records and
 * LeetType's answer notes: those home doesn't hold yet. Reads only this
 * phone; a store it cannot read carries none.
 */
export async function notesGoing(
  pairing: string,
  storage: KeyedStorage | null
): Promise<Array<StudyNote>> {
  const { leetypeNotes } = await import("@/lib/leetype-takes")
  const kept = soundbiteKeeping()
  const bites = kept === null ? [] : await kept.store.list().catch(() => [])
  return notesToSend(notesOf(bites, leetypeNotes()), readSent(storage, pairing))
}
