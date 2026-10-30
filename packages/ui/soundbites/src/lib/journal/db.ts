/**
 * The Build Journal's database, which Studio projects share: one
 * `JOURNAL_TAKES_MAX_BYTES` covers the audio of both, so a project adds no
 * cap of its own to the phone's. Version 2 adds the project stores beside
 * the journal's plan, takes and audio, and keeps everything version 1 held.
 * Version 3 adds `friction`: how each sitting went, one row per sitting,
 * kept on the phone until home takes it (STUDIO ST9).
 *
 * The journal's own stores (`plan`, `takes`, `audio`) hold an episode kept
 * before Studio's projects; `carryJournal` (`project/store.ts`) moves it into
 * a project the first time Studio opens, and nothing writes them after.
 */
import { connection, result } from "@some-ui/voice-capture"
import { askToKeep } from "@soundbites/lib/store"

export const JOURNAL_STORES = {
  plan: "plan",
  takes: "takes",
  audio: "audio",
  projects: "projects",
  projectAudio: "project-audio",
  friction: "friction",
} as const

/** Every audio store the takes cap covers. */
export const AUDIO_STORES = [
  JOURNAL_STORES.audio,
  JOURNAL_STORES.projectAudio,
] as const

/** A connection of its own to the journal's database, opened on first use. */
export function journalDatabase(): () => Promise<IDBDatabase> {
  return connection(
    "some-ui.journal",
    3,
    (db) => {
      const make = (name: string, keyPath?: string): void => {
        if (db.objectStoreNames.contains(name)) return
        if (keyPath === undefined) db.createObjectStore(name)
        else db.createObjectStore(name, { keyPath })
      }
      make(JOURNAL_STORES.plan)
      make(JOURNAL_STORES.takes, "cutId")
      make(JOURNAL_STORES.audio)
      make(JOURNAL_STORES.projects, "id")
      make(JOURNAL_STORES.projectAudio)
      make(JOURNAL_STORES.friction, "id")
    },
    askToKeep
  )
}

/** The audio bytes of every store but `besides`'s, in the caller's transaction. */
export async function otherAudioBytes(
  tx: IDBTransaction,
  besides: (typeof AUDIO_STORES)[number]
): Promise<number> {
  let sum = 0
  for (const name of AUDIO_STORES) {
    if (name === besides) continue
    const kept: Array<unknown> = await result(tx.objectStore(name).getAll())
    for (const each of kept) if (each instanceof Blob) sum += each.size
  }
  return sum
}

/** Where a project take's audio is kept: take ids are unique only within a project. */
export function projectAudioKey(project: string, take: string): string {
  return `${project}:${take}`
}
