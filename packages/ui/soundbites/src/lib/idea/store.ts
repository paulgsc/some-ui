/**
 * Where caught ideas are kept on the phone: one `localStorage` record of
 * text, read and written only through core-utils' `openKept` and
 * `writeKept` (KR1), so a value it can't read whole is moved aside, never
 * written over. A write is a change applied to what is held now, refused
 * unless it only adds (`grows`): an answer, Claude's questions and scenes
 * (ST19), a mark setting it aside or bringing it back.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"
import { PrimerSchema } from "@soundbites/lib/project/file"
import { z } from "zod"

import type { Idea } from "./model"
import {
  ANSWER_TO,
  FOLLOW_UPS,
  grows,
  IDEA_FORMATS,
  TITLE_MAX,
  WORDS_HOW,
} from "./model"

export const IDEAS_KEY = "some-ui:studio:ideas"

const IdeaSchema: z.ZodType<Idea> = z.object({
  id: z.string().regex(/^[\w-]+$/),
  at: z.string(),
  questions: z.number().int().positive(),
  answers: z.array(
    z
      .object({
        question: z.enum(ANSWER_TO),
        versions: z.array(
          z.object({
            at: z.string(),
            how: z.enum(WORDS_HOW),
            words: z.string(),
          })
        ),
        takes: z
          .array(z.object({ at: z.string(), take: z.string().min(1) }))
          .optional(),
      })
      // Words, or a take said for it (ST26): never neither.
      .refine(
        (answer) =>
          answer.versions.length > 0 || (answer.takes?.length ?? 0) > 0
      )
  ),
  passed: z.array(z.enum(ANSWER_TO)),
  asked: z
    .array(
      z.object({
        id: z.enum(FOLLOW_UPS),
        at: z.string(),
        words: z.string().min(1),
      })
    )
    .max(FOLLOW_UPS.length)
    .optional(),
  drafts: z
    .array(z.object({ at: z.string(), primer: PrimerSchema }))
    .optional(),
  shelved: z.array(z.object({ at: z.string(), aside: z.boolean() })).optional(),
  about: z
    .object({
      title: z.string().trim().min(1).max(TITLE_MAX),
      topic: z.string().nullable(),
      keywords: z.array(z.string()),
      format: z.enum(IDEA_FORMATS),
    })
    .optional(),
  sent: z.array(z.string()).optional(),
})

function isIdea(value: unknown): value is Idea {
  return IdeaSchema.safeParse(value).success
}

/** Reads the kept list entry by entry, keeping each idea it can read. */
const readIdeas = salvageList(isIdea)

export type IdeaStore = {
  /** Every idea kept, oldest first; null when they can't be read. */
  list: () => ReadonlyArray<Idea> | null
  /**
   * Applies `change` to the ideas kept now and keeps the result; the ideas
   * as kept, or null when nothing was kept (the storage refused it, or the
   * change would have let something go).
   */
  keep: (
    change: (ideas: ReadonlyArray<Idea>) => ReadonlyArray<Idea>
  ) => ReadonlyArray<Idea> | null
}

/** Ideas kept in `storage` (the page's own, looked up on each call). */
export function keptIdeaStore(
  storage: () => KeyedStorage | null = localStorageOrNull
): IdeaStore {
  const open = (): { value: ReadonlyArray<Idea>; writable: boolean } =>
    openKept<ReadonlyArray<Idea>>(storage(), IDEAS_KEY, readIdeas, [])
  return {
    list: (): ReadonlyArray<Idea> | null => {
      const opened = open()
      return opened.writable ? opened.value : null
    },
    keep: (change): ReadonlyArray<Idea> | null => {
      const opened = open()
      if (!opened.writable) return null
      const next = change(opened.value)
      if (!grows(opened.value, next)) return null
      return writeKept(storage(), IDEAS_KEY, next, readIdeas) ? next : null
    },
  }
}
