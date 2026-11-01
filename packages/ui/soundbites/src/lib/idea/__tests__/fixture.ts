import type { Idea } from "@soundbites/lib/idea/model"
import { newIdea, withReply, withWords } from "@soundbites/lib/idea/model"

export const AT = "2026-10-30T10:00:00.000Z"
export const LATER = "2026-11-20T18:30:00.000Z"

/** An idea caught with two answers: what the video is, and what set it off. */
export function caught(id = "idea-1"): Idea {
  return withWords(
    newIdea(id, AT, "what", [
      { at: AT, how: "heard", words: "a short about the week 8 picks" },
    ]),
    "spark",
    [{ at: AT, how: "typed", words: "the model called Detroit" }]
  )
}

/** A primer v2 fleshed out from `caught`, its first cut citing two answers. */
export const DRAFT = {
  version: 2,
  title: "Week 8 picks",
  cuts: [
    {
      id: "path",
      artifact: "The path card",
      point: "Following the model paid off",
      keep: ["3 of 4 picks hit"],
      targetSec: 20,
      from: ["what", "spark"],
    },
    {
      id: "next",
      artifact: "End card",
      point: "What week 9 tests",
      targetSec: 10,
    },
  ],
}

/** What a session sends back about idea `id`. */
export function replyText(
  fields: Readonly<Record<string, unknown>>,
  id = "idea-1"
): string {
  return JSON.stringify({
    schema: "some-ui.studio-idea-reply/1",
    idea: id,
    ...fields,
  })
}

/**
 * `caught`, with three questions from Claude waiting on it: what the capture
 * of Claude's questions (`IdeaCapture`, ST19) opens on.
 */
export function asked(id = "idea-1"): Idea {
  const idea = withReply(
    caught(id),
    { primer: null, ask: ["Which week?", "Why now?", "What changed?"] },
    AT
  )
  if (idea === null) throw new Error("no questions asked")
  return idea
}
