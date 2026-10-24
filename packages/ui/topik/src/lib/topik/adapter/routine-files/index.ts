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
 */

import { localStorageOrNull } from "@some-ui/core-utils"
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
}

export function createRoutineFeed(port: RoutineFilesPort): RoutineFeed {
  return {
    ...(port.key === undefined ? {} : { key: port.key }),
    list: async () => parseRoutineFiles(await port.list()),
  }
}

export const ROUTINE_OPENED_KEY = "topik:routine-opened"

/** A file's key in the opened record: home keys it by folder and name. */
export const openedKey = (file: RoutineFile): string =>
  `${file.kind}/${file.name}`

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
        // Quota, privacy mode: the file shows as not opened next time.
      }
    },
  }
}
