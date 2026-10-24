/**
 * What the reflections routine left for the learner on home: the word sets
 * and dramas that answer their study reflections and drama prompts
 * (paulgsc/server `GET /routine/files`, through the Jobs mailbox's `scene`
 * and `drama` folders). The handheld lists the ones not opened yet under
 * "From the routine"; opening one adds it exactly as a file picked from
 * storage is added (`intakeSet`, `intakeTree`).
 *
 * Which files were opened is kept on the device (`createOpenedStore`), by
 * name, so a file home still serves is not offered twice. The list only
 * grows: a few names a day.
 */

import { localStorageOrNull } from "@some-ui/core-utils"
import { z } from "zod"

/** The host's way to home; absent, the handheld lists nothing from it. */
export type RoutineFilesPort = {
  /** Home's answer, as it came: parsed here. */
  list: () => Promise<unknown>
}

export type RoutineFile =
  | {
      kind: "scene"
      name: string
      /** The scene folder's name: `TOPIK 2 · 로맨스 · its title`. */
      title: string
      /** Each a word set, as `intakeSet` takes it. */
      decks: ReadonlyArray<unknown>
    }
  | {
      kind: "drama"
      name: string
      /** The scene tree, as `intakeTree` takes it. */
      tree: unknown
    }

const SceneSchema = z.object({
  schema: z.literal("some-ui.routine-scene/1"),
  title: z.string().min(1),
  decks: z.array(z.unknown()).min(1),
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
 * not know is left out, not shown broken; an answer that is not one at all
 * is no files.
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
      return drama.success
        ? [{ kind: "drama", name: held.name, tree: drama.data.tree }]
        : []
    }
    return []
  })
}

/** Home's files, parsed: what the handheld's query reads. */
export type RoutineFeed = {
  list: () => Promise<ReadonlyArray<RoutineFile>>
}

export function createRoutineFeed(port: RoutineFilesPort): RoutineFeed {
  return { list: async () => parseRoutineFiles(await port.list()) }
}

export const ROUTINE_OPENED_KEY = "topik:routine-opened"

const OpenedSchema = z.object({
  version: z.literal(1),
  names: z.array(z.string()),
})

export type OpenedStore = {
  /** The same set until a name is added. */
  opened: () => ReadonlySet<string>
  markOpened: (name: string) => void
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
        // Quota, privacy mode: the file is offered again next time.
      }
    },
  }
}
