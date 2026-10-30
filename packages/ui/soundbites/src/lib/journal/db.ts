/**
 * The Build Journal's database, which Studio projects share. Version 2 adds
 * the project stores beside the journal's plan, takes and audio, and keeps
 * everything version 1 held. Version 3 adds `friction` (how each sitting
 * went, one row per sitting, kept on the phone until home takes it, STUDIO
 * ST9) and `notices` (what a screen that had gone away couldn't keep, for the
 * next Start to say).
 *
 * The journal's own stores (`plan`, `takes`, `audio`) hold an episode kept
 * before Studio's projects; `carryJournal` (`project/store.ts`) moves it into
 * a project the first time Studio opens and lets go of what it couldn't read
 * (owner, 2026-10-30, #2251), and nothing writes them after.
 */
import { connection } from "@some-ui/voice-capture"
import { askToKeep } from "@soundbites/lib/store"

export const JOURNAL_STORES = {
  plan: "plan",
  takes: "takes",
  audio: "audio",
  projects: "projects",
  projectAudio: "project-audio",
  friction: "friction",
  notices: "notices",
} as const

/** A connection of its own to the journal's database, opened on first use. */
export function journalDatabase(): () => Promise<IDBDatabase> {
  return connection(
    "some-ui.journal",
    3,
    (db) => {
      const make = (name: string, options?: IDBObjectStoreParameters): void => {
        if (db.objectStoreNames.contains(name)) return
        db.createObjectStore(name, options)
      }
      make(JOURNAL_STORES.plan)
      make(JOURNAL_STORES.takes, { keyPath: "cutId" })
      make(JOURNAL_STORES.audio)
      make(JOURNAL_STORES.projects, { keyPath: "id" })
      make(JOURNAL_STORES.projectAudio)
      make(JOURNAL_STORES.friction, { keyPath: "id" })
      make(JOURNAL_STORES.notices, { autoIncrement: true })
    },
    askToKeep
  )
}

/** Where a project take's audio is kept: take ids are unique only within a project. */
export function projectAudioKey(project: string, take: string): string {
  return `${project}:${take}`
}
