/**
 * My data's delete of a record home keeps (MY-DATA MD3, #2477; paulgsc/server
 * `DELETE /voice-notes/:id`, `voice_repo::delete`): on "Delete for good" in
 * My data's sheet, one run of the link's `send`, the run a tap starts (LA8),
 * with one `DELETE` per note the sheet named, in order. It sends nothing of
 * the phone's but each note's id, and never retries: a note home didn't
 * answer for is left for the person's next tap. What home's answers mean is
 * `lib/my-data/deleting`'s, its one reader; this hands them back as they
 * came.
 *
 * A request that fails on the way ends the run there: the notes answered
 * before it keep their answers, and those after it were not sent.
 *
 * LA19 (docs/learner-data-authority.md): the one sender of a `DELETE` to
 * home, imported by `lib/my-data` alone and called by its delete runtime
 * alone (the egress test's "LA19 (MD5)" checks).
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink, paired } from "./index"

/** The delete of note `id`, as home takes it. */
export function deletePath(id: string): string {
  return `/voice-notes/${encodeURIComponent(id)}`
}

/** One note's answer, or null when the run ended before it was sent. */
type NoteAnswer = {
  readonly id: string
  readonly answer: HomeAnswer | null
}

/** What came of the run, or why there was none. */
export type DeleteAsked =
  | {
      readonly kind: "answered"
      /** One per note asked, in order. */
      readonly answers: ReadonlyArray<NoteAnswer>
    }
  /** Not paired: nothing was sent. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or stopped: nothing was answered. */
  | { readonly kind: "busy" }
  /** No answer at all. */
  | { readonly kind: "unreachable" }

/** Asks home once to delete each of `ids` for good; never rejects. */
export async function deleteNotes(
  ids: ReadonlyArray<string>
): Promise<DeleteAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().send(async (send) => {
      const answers: Array<NoteAnswer> = []
      for (const id of ids) {
        try {
          answers.push({ id, answer: await send("DELETE", deletePath(id)) })
        } catch (error) {
          if (answers.length === 0) throw error
          break
        }
      }
      return answers
    })
    if (outcome?.kind !== "done") return { kind: "busy" }
    const answered = new Map(
      outcome.value.map(({ id, answer }) => [id, answer])
    )
    return {
      kind: "answered",
      answers: ids.map((id) => ({ id, answer: answered.get(id) ?? null })),
    }
  } catch {
    return { kind: "unreachable" }
  }
}
