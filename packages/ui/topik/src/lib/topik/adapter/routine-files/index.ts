/**
 * What the reflections routine left for the learner on home: the word sets
 * and dramas that answer their study reflections and drama prompts
 * (paulgsc/server `GET /routine/files`, through the Jobs mailbox's `scene`
 * and `drama` folders). The handheld lists them under "From the routine";
 * opening one adds it exactly as a file picked from storage is added
 * (`intakeSet`, or `intakeTree` here, so a drama the phone could not play
 * is never listed).
 *
 * Which files were opened is kept on the device (`createOpenedStore`), by
 * folder and name, so the list can say so; an opened file stays listed,
 * since home's list is the only way back to it. The record only grows: a
 * few names a day.
 *
 * Home's last answer is kept on the device too (`createHeldAnswers`), for
 * each home it reads, so the list is
 * there away from home. It is a copy of what home holds, replaced by each
 * newer answer: home keeps the files, so nothing of the learner's is lost
 * when it is.
 */

import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openRecord,
  writeRecord,
} from "@some-ui/core-utils"
import type { RunLog } from "@topik/lib/topik/adapter/routine-runs"
import {
  parseRoutineRuns,
  sharedRunLog,
} from "@topik/lib/topik/adapter/routine-runs"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import { intakeTree } from "@topik/lib/topik/generation/tree-intake"
import { z } from "zod"

/** The host's way to home; absent, the handheld lists nothing from it. */
export type RoutineFilesPort = {
  /**
   * Whose answers these are, where the host can reach more than one home
   * (the Android app's pairing, and its person's choice to show them): a
   * new key lists nothing of the old one's. Absent, there is one.
   */
  key?: string
  /** Home's answer, as it came: parsed here. */
  list: () => Promise<unknown>
  /** Tells home which were opened (`openedKey`s); absent where not chosen. */
  opened?: (keys: ReadonlyArray<string>) => void
}

export type RoutineFile =
  | {
      kind: "scene"
      name: string
      /** The scene folder's name: `TOPIK 2 · 로맨스 · its title`. */
      title: string
      /** The read-aloud set and the lens set, each as `intakeSet` takes it. */
      decks: ReadonlyArray<unknown>
    }
  | {
      kind: "drama"
      name: string
      /** The scene tree, checked: `intakeTree` found nothing in it. */
      tree: DramaLesson
    }

const SceneSchema = z.object({
  schema: z.literal("some-ui.routine-scene/1"),
  title: z.string().min(1),
  decks: z.array(z.unknown()).length(2),
})

const DramaSchema = z.object({
  schema: z.literal("some-ui.routine-drama/1"),
  tree: z.unknown(),
})

const AnswerSchema = z.object({
  files: z.array(
    z.object({
      folder: z.string(),
      name: z.string(),
      file: z.unknown(),
    })
  ),
})

/**
 * Home's answer as files, newest first. A file of a shape this build does
 * not know, or a drama the intake does not pass whole, is left out, not
 * shown broken; an answer that is not one at all is no files.
 */
export function parseRoutineFiles(answer: unknown): ReadonlyArray<RoutineFile> {
  const parsed = AnswerSchema.safeParse(answer)
  if (!parsed.success) return []
  return parsed.data.files.flatMap((held): Array<RoutineFile> => {
    if (held.folder === "scene") {
      const scene = SceneSchema.safeParse(held.file)
      return scene.success
        ? [
            {
              kind: "scene",
              name: held.name,
              title: scene.data.title,
              decks: scene.data.decks,
            },
          ]
        : []
    }
    if (held.folder === "drama") {
      const drama = DramaSchema.safeParse(held.file)
      if (!drama.success || drama.data.tree === undefined) return []
      const intake = intakeTree(JSON.stringify(drama.data.tree))
      return intake.status === "checked" && intake.findings.length === 0
        ? [{ kind: "drama", name: held.name, tree: intake.lesson }]
        : []
    }
    return []
  })
}

/** Home's files, parsed: what the handheld's query reads. */
export type RoutineFeed = {
  /** The port's `key`: what the query is keyed on. */
  key?: string
  list: () => Promise<ReadonlyArray<RoutineFile>>
  /** What the phone holds from home now, before any look: shown at once. */
  initial?: () => ReadonlyArray<RoutineFile>
  /** The port's `opened`: absent where home is not to be told. */
  tellOpened?: (keys: ReadonlyArray<string>) => void
  /**
   * The routine's runs this phone heard of, kept under `key` as each look
   * brings them (`adapter/routine-runs`). Absent, none are said.
   */
  runs?: RunLog
}

export function createRoutineFeed(
  port: RoutineFilesPort,
  runs: RunLog = sharedRunLog(),
  held: HeldAnswers = sharedHeldAnswers()
): RoutineFeed {
  const key = port.key ?? ""
  return {
    ...(port.key === undefined ? {} : { key: port.key }),
    list: async (): Promise<ReadonlyArray<RoutineFile>> => {
      const answer = await port.list()
      // Home dates each answer it gives; what the port hands back without a
      // date (no answer, away from home) lists what home last said.
      const heard = parseRoutineRuns(answer)
      if (heard === null) return parseRoutineFiles(held.held(key) ?? answer)
      runs.keep(key, heard)
      held.keep(key, heard.at, answer)
      return parseRoutineFiles(held.held(key))
    },
    initial: () => parseRoutineFiles(held.held(key)),
    ...(port.opened ? { tellOpened: port.opened } : {}),
    runs,
  }
}

export const ROUTINE_ANSWERS_KEY = "topik:routine-answers"

const HeldSchema = z.object({
  version: z.literal(1),
  homes: z.record(
    z.string(),
    z.object({ at: z.string(), answer: z.unknown() })
  ),
})

export type HeldAnswers = {
  /** Home's newest answer kept for `key`, as it came, or null. */
  held: (key: string) => unknown
  /** Keeps `answer`, given at `at` by home's clock, unless a newer one is kept. */
  keep: (key: string, at: string, answer: unknown) => void
}

function parseHeld(
  raw: string
): Record<string, { at: string; answer: unknown }> | null {
  try {
    const parsed = HeldSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.homes : null
  } catch {
    return null
  }
}

/**
 * Home's last answer for each home, on this device. An unreadable copy is
 * moved aside (`openRecord`); a failed write keeps it until the app closes.
 */
export function createHeldAnswers(
  storage: KeyedStorage | null = localStorageOrNull()
): HeldAnswers {
  type Homes = Record<string, { at: string; answer: unknown }>
  /** What is stored, or null when storage throws (nothing may be written). */
  const read = (): Homes | null => {
    if (storage === null) return null
    const opened = openRecord(
      storage,
      ROUTINE_ANSWERS_KEY,
      parseHeld,
      `${ROUTINE_ANSWERS_KEY}:unreadable:`
    )
    if (opened.kind === "unreadable") return null
    return opened.kind === "kept" ? opened.value : {}
  }
  /** Each home's newer answer of the two. */
  const newest = (a: Homes, b: Homes): Homes => {
    const both = { ...a }
    for (const [key, held] of Object.entries(b)) {
      const mine = both[key]
      if (mine === undefined || mine.at.localeCompare(held.at) < 0) {
        both[key] = held
      }
    }
    return both
  }
  const first = read()
  let writable = first !== null
  let homes: Homes = first ?? {}
  return {
    held: (key) => homes[key]?.answer ?? null,
    keep(key, at, answer): void {
      homes = newest(homes, { [key]: { at, answer } })
      // Another page on this device may have kept a newer answer since this
      // one read: the newest for each home is what is written.
      const stored = writable ? read() : null
      if (stored === null) writable = false
      if (stored === null || storage === null) return
      homes = newest(homes, stored)
      writeRecord(
        storage,
        ROUTINE_ANSWERS_KEY,
        JSON.stringify({ version: 1, homes }),
        parseHeld
      )
    },
  }
}

let sharedHeld: HeldAnswers | null = null

/** One copy per page load, over `localStorage`. */
function sharedHeldAnswers(): HeldAnswers {
  sharedHeld ??= createHeldAnswers()
  return sharedHeld
}

export const ROUTINE_OPENED_KEY = "topik:routine-opened"

/** A file's key in the opened record: home keys it by folder and name. */
/** A routine file's key, `<folder>/<name>`, as home names it. */
export const routineKey = (folder: string, name: string): string =>
  `${folder}/${name}`

export const openedKey = (file: RoutineFile): string =>
  routineKey(file.kind, file.name)

const OpenedSchema = z.object({
  version: z.literal(1),
  names: z.array(z.string()),
})

export type OpenedStore = {
  /** The same set until a key is added; keys are `openedKey`'s. */
  opened: () => ReadonlySet<string>
  markOpened: (key: string) => void
}

/** The names opened on this device. A failed read is none, a failed write is lost. */
export function createOpenedStore(
  storage: Pick<Storage, "getItem" | "setItem"> | null = localStorageOrNull()
): OpenedStore {
  const read = (): Set<string> => {
    try {
      const parsed = OpenedSchema.safeParse(
        JSON.parse(storage?.getItem(ROUTINE_OPENED_KEY) ?? "null")
      )
      return new Set(parsed.success ? parsed.data.names : [])
    } catch {
      return new Set()
    }
  }
  let names = read()
  return {
    opened: () => names,
    markOpened: (name): void => {
      if (names.has(name)) return
      names = new Set([...names, name])
      try {
        storage?.setItem(
          ROUTINE_OPENED_KEY,
          JSON.stringify({ version: 1, names: [...names] })
        )
      } catch {
        // Ignored: quota, privacy mode: the file shows as not opened next time.
      }
    },
  }
}
