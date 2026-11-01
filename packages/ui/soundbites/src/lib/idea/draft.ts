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

const DRAFT_KEY = "some-ui:studio:idea-draft"

export type IdeaDraft = {
  /** The idea's id once sent: letters, digits and dashes. */
  readonly id: string
  /** ISO time it was started: the date the idea is known by. */
  readonly at: string
  readonly about: IdeaAbout
  /** Answers typed because voice didn't work, at most `TYPED_MAX` long. */
  readonly typed: Partial<Readonly<Record<QuestionId, string>>>
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
 * the phone reads home's.
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
