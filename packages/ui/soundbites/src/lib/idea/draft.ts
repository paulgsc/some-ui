/**
 * A new idea before it is sent (ST26): what it is (its title, topic,
 * keywords and format), the questions left for later, and any answer typed
 * because voice didn't work. Its spoken answers are takes on the phone's
 * desk (www's `lib/idea-takes`), named by what they answer
 * (`answersOf`), which wait there until the idea is sent.
 *
 * One draft at a time, in one `localStorage` record read and written only
 * through core-utils' `openKept` and `writeKept` (KR1), so a value it can't
 * read whole is moved aside, never written over. It is written over freely:
 * nothing has left the phone, and deleting it before Send is gone for good
 * (the owner's ruling on #2265, `docs/discard-sites.md`). Sending it adds
 * the idea, whole and dated, to the ideas kept (`./store`, which only ever
 * grows), and then clears it.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  readJson,
  writeKept,
} from "@some-ui/core-utils"
import { z } from "zod"

import type { IdeaAbout, QuestionId } from "./model"
import { IDEA_FORMATS, IDEA_QUESTIONS, TITLE_MAX, TYPED_MAX } from "./model"

export const DRAFT_KEY = "some-ui:studio:idea-draft"

export type IdeaDraft = {
  /** The idea's id once sent: letters, digits and dashes. */
  readonly id: string
  /** ISO time it was started: the date the idea is known by. */
  readonly at: string
  readonly about: IdeaAbout
  /** Answers typed because voice didn't work, at most `TYPED_MAX` long. */
  readonly typed: Partial<Readonly<Record<QuestionId, string>>>
  /**
   * Typed words that stand beside a take kept with no voice heard in it
   * (ST34): that take's id, by the question both answer. The take stays,
   * and both go with the idea. Absent in a draft kept before.
   */
  readonly beside?: Partial<Readonly<Record<QuestionId, string>>>
  /**
   * By question, its last take kept, when that take held no voice heard
   * (ST34): its card offers typing beside it until a take heard replaces
   * it, however often the screen came and went or a try failed in between.
   * Absent when none is.
   */
  readonly unheard?: Partial<Readonly<Record<QuestionId, string>>>
  /** Questions left to come back to, in the order they were left. */
  readonly later: ReadonlyArray<QuestionId>
}

/** The topics and keywords an idea picks from (kept on home, ST26). */
export type IdeaLists = {
  readonly topics: ReadonlyArray<string>
  readonly keywords: ReadonlyArray<string>
}

/**
 * The lists every idea starts with (the owner, paulgsc/server#645), until
 * the phone has read home's (`keptIdeaLists`).
 */
export const IDEA_LISTS_SEED: IdeaLists = {
  topics: ["Studio", "LeetType", "Korean", "Playoff Delta", "Rust Rounds"],
  keywords: [
    "home",
    "voice",
    "phone",
    "mistakes",
    "how it works",
    "behind the scenes",
  ],
}

const LISTS_KEY = "some-ui:studio:idea-lists"

const ListsSchema: z.ZodType<IdeaLists> = z.object({
  topics: z.array(z.string()),
  keywords: z.array(z.string()),
})

const readLists = readJson((value) => {
  const parsed = ListsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
})

/**
 * The lists as home last said them (ST26 (c)), for a new idea to pick from:
 * a copy, written each time Ideas on home reads them or changes one, and
 * read when a new idea opens. Until home has said them, or when the copy
 * can't be read, the seeds every list starts with. Written over freely: the
 * lists are home's, which keeps every change.
 */
export function keptIdeaLists(
  storage: () => KeyedStorage | null = localStorageOrNull
): { read: () => IdeaLists; write: (lists: IdeaLists) => boolean } {
  return {
    read: (): IdeaLists =>
      openKept<IdeaLists>(storage(), LISTS_KEY, readLists, IDEA_LISTS_SEED)
        .value,
    write: (lists): boolean =>
      writeKept(storage(), LISTS_KEY, lists, readLists),
  }
}

/** A new draft: a Short, on the first topic, with nothing said. */
export function newDraft(id: string, at: string, lists: IdeaLists): IdeaDraft {
  return {
    id,
    at,
    about: {
      title: "",
      topic: lists.topics[0] ?? null,
      keywords: [],
      format: "short",
    },
    typed: {},
    later: [],
  }
}

/**
 * What a take of the draft's answer to `question` answers, as the take is
 * kept and told home: `idea:<idea>:<question>`, a Studio note's `ref`.
 */
export function answersOf(ideaId: string, question: QuestionId): string {
  return `idea:${ideaId}:${question}`
}

/** The question a take answers, when it is one of draft `ideaId`'s. */
export function questionOf(ideaId: string, answers: string): QuestionId | null {
  return (
    IDEA_QUESTIONS.find(
      (question) => answersOf(ideaId, question) === answers
    ) ?? null
  )
}

const DraftSchema: z.ZodType<IdeaDraft> = z.object({
  id: z.string().regex(/^[\w-]+$/),
  at: z.string(),
  about: z.object({
    // Typed as it is said: trimmed only once it is sent.
    title: z.string().max(TITLE_MAX),
    topic: z.string().nullable(),
    keywords: z.array(z.string()),
    format: z.enum(IDEA_FORMATS),
  }),
  typed: z.partialRecord(z.enum(IDEA_QUESTIONS), z.string().max(TYPED_MAX)),
  beside: z.partialRecord(z.enum(IDEA_QUESTIONS), z.string()).optional(),
  unheard: z.partialRecord(z.enum(IDEA_QUESTIONS), z.string()).optional(),
  later: z.array(z.enum(IDEA_QUESTIONS)),
})

/** The record as kept: the draft, or none. */
const RecordSchema = z.object({ draft: DraftSchema.nullable() })

const readDraft = readJson((value) => {
  const parsed = RecordSchema.safeParse(value)
  return parsed.success ? parsed.data : null
})

export type DraftStore = {
  /**
   * The draft kept, `null` when there is none; `undefined` when what is
   * kept can't be read.
   */
  read: () => IdeaDraft | null | undefined
  /** Keeps `draft` in place of any other, or clears it; false when not kept. */
  write: (draft: IdeaDraft | null) => boolean
}

/** The draft kept in `storage` (the page's own, looked up on each call). */
export function keptDraftStore(
  storage: () => KeyedStorage | null = localStorageOrNull
): DraftStore {
  return {
    read: (): IdeaDraft | null | undefined => {
      const opened = openKept<{ draft: IdeaDraft | null }>(
        storage(),
        DRAFT_KEY,
        readDraft,
        { draft: null }
      )
      return opened.writable ? opened.value.draft : undefined
    },
    write: (draft): boolean =>
      writeKept(storage(), DRAFT_KEY, { draft }, readDraft),
  }
}
