/**
 * What this phone holds for the drain (`./drain`): its sessions and kept
 * shelf items, its finished LeetType sessions, Studio's sittings and
 * answers and its written reflections, each read from the phone alone, and
 * the LeetType, Studio and reflection parts already narrowed to what home
 * does not hold as it is now (`./sent`). Nothing here sends; the one thing
 * it lets go is a written reflection past the offline set that home holds
 * (`letGoHeldReflections`, LA16).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import type { HomeSession } from "@some-ui/leetype"

import { deviceBackend } from "@/lib/device-backend/boot"
import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { everyKept } from "@/lib/device-backend/handlers/shelf"
import { reflections } from "@/lib/session-reflection"
import { studioKeeping } from "@/lib/studio-keeping"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

import type { Written } from "./reflections"
import { heldWritten, writtenToSend } from "./reflections"
import type { Sent } from "./sent"
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
 * The written reflections a run under `pairing` carries: what home doesn't
 * hold as it is now. Reads only this phone.
 */
export function reflectionsGoing(
  pairing: string,
  storage: KeyedStorage | null
): Array<Written> {
  return writtenToSend(
    reflections.getSnapshot().kept,
    readSent(storage, pairing)
  )
}

/**
 * Lets go of the written reflections past the offline set that `sent` says
 * home holds as they are (LA16). The one-tap answers and spoken
 * reflections stay; so does every one home does not hold.
 */
export function letGoHeldReflections(sent: Sent): void {
  reflections.trimOffline(heldWritten(reflections.getSnapshot().kept, sent))
}
