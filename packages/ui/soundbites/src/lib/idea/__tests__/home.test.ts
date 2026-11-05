/** @vitest-environment node */
import { ideaForHome, ideasForHome } from "@soundbites/lib/idea/home"
import type { Idea } from "@soundbites/lib/idea/model"
import { describe, expect, it } from "vitest"

import { AT, caught, LATER } from "./fixture"

/** An idea sent whole (ST26): said, typed and passed answers. */
const SENT: Idea = {
  id: "i1",
  at: AT,
  questions: 1,
  answers: [
    {
      question: "what",
      versions: [],
      takes: [
        { at: AT, take: "t-old" },
        { at: AT, take: "t1" },
      ],
    },
    {
      question: "takeaway",
      versions: [
        { at: AT, how: "typed", words: "Keep the phone a hand away." },
      ],
    },
    {
      question: "ask-1",
      versions: [
        { at: AT, how: "typed", words: "Claude's question, answered" },
      ],
    },
  ],
  passed: ["spark", "picture"],
  about: {
    title: "Why the mic clips",
    topic: "Studio",
    keywords: ["voice", "mistakes"],
    format: "short",
  },
  sent: [AT, LATER],
}

describe("a sent idea as home keeps it (ST26 b)", () => {
  it("is the bundle: its take now by id, typed words, never Claude's questions, sent last", () => {
    expect(ideaForHome(SENT)).toEqual({
      id: "i1",
      createdAt: AT,
      sentAt: LATER,
      title: "Why the mic clips",
      topic: "Studio",
      format: "short",
      keywords: ["voice", "mistakes"],
      questions: 1,
      answers: [
        { question: "what", note: "t1" },
        { question: "takeaway", typed: "Keep the phone a hand away." },
      ],
    })
  })

  it("sends words typed beside a take kept unheard as the answer's words (ST34)", () => {
    const beside: Idea = {
      ...SENT,
      answers: [
        {
          question: "what",
          versions: [{ at: LATER, how: "typed", words: "Two hearings" }],
          takes: [{ at: AT, take: "t1" }],
        },
      ],
    }
    expect(ideaForHome(beside)?.answers).toEqual([
      { question: "what", typed: "Two hearings" },
    ])
  })

  it("goes for an idea sent whole only, with a topic", () => {
    expect(ideaForHome(caught())).toBeNull()
    const noTopic: Idea = {
      ...SENT,
      about: { ...SENT.about!, topic: null },
    }
    expect(ideaForHome(noTopic)).toBeNull()
    expect(
      ideasForHome([caught(), SENT, noTopic]).map((each) => each.id)
    ).toEqual(["i1"])
  })
})
