/** @vitest-environment node */
import { isFollowUp, withReply } from "@soundbites/lib/idea/model"
import { ideaFile, isIdeaReply, readReply } from "@soundbites/lib/idea/reply"
import { describe, expect, it } from "vitest"

import { AT, caught, DRAFT, replyText } from "./fixture"

describe("an idea out to Claude", () => {
  it("goes as its words and its questions, text only", () => {
    const { name, data } = ideaFile(caught())
    expect(name).toBe("idea-idea-1.json")
    const body: unknown = JSON.parse(data)
    expect(body).toMatchObject({
      schema: "some-ui.studio-idea/1",
      idea: { id: "idea-1" },
      questions: {
        what: "What's the video?",
        spark: "What set it off?",
      },
      scenes: null,
      reply: {
        schema: "some-ui.studio-idea-reply/1",
        idea: "idea-1",
        askAtMost: 3,
      },
    })
    expect(data).not.toMatch(/audio|blob|base64|drive\.google/i)
  })

  it("carries Claude's questions and the scenes kept, so a session picks it up cold", () => {
    const idea = withReply(caught(), { primer: null, ask: ["Which week?"] }, AT)
    if (idea === null) throw new Error("kept")
    const body: unknown = JSON.parse(ideaFile(idea).data)
    expect(body).toMatchObject({
      questions: { "ask-1": "Which week?" },
      reply: { askAtMost: 2 },
    })
  })
})

describe("what Claude sends back", () => {
  it("is told apart from anything else picked", () => {
    expect(isIdeaReply(replyText({ ask: ["Which week?"] }))).toBe(true)
    expect(isIdeaReply(JSON.stringify(DRAFT))).toBe(false)
    expect(isIdeaReply("not json")).toBe(false)
  })

  it("reads scenes citing the idea's answers, and Claude's questions", () => {
    const reading = readReply(
      replyText({ primer: DRAFT, ask: ["Which week?"] }),
      caught()
    )
    expect(reading.ok).toBe(true)
    if (!reading.ok) return
    expect(reading.reply.ask).toEqual(["Which week?"])
    expect(reading.reply.primer?.idea).toBe("idea-1")
    expect(reading.reply.primer?.cuts.map((cut) => cut.from)).toEqual([
      ["what", "spark"],
      undefined,
    ])
  })

  it("takes questions alone, where the answers leave a gap", () => {
    const reading = readReply(replyText({ ask: ["Which week?"] }), caught())
    expect(reading).toEqual({
      ok: true,
      reply: { primer: null, ask: ["Which week?"] },
    })
  })

  it.each([
    ["another idea's", replyText({ ask: ["?"] }, "idea-2"), "otherIdea"],
    ["a primer alone", JSON.stringify(DRAFT), "notReply"],
    ["nothing in it", replyText({}), "wrong"],
    ["four questions", replyText({ ask: ["a", "b", "c", "d"] }), "wrong"],
    [
      "a cut citing an answer the idea hasn't",
      replyText({
        primer: { ...DRAFT, cuts: [{ ...DRAFT.cuts[0], from: ["picture"] }] },
      }),
      "wrong",
    ],
    [
      "a primer naming another idea",
      replyText({ primer: { ...DRAFT, idea: "idea-2" } }),
      "wrong",
    ],
    ["a primer it can't read", replyText({ primer: { version: 2 } }), "wrong"],
  ])("refuses %s", (_, text, why) => {
    const reading = readReply(text, caught())
    expect(reading.ok).toBe(false)
    if (!reading.ok) expect(reading.why).toBe(why)
  })

  it("lets Claude ask at most three questions in an idea's life", () => {
    const twice = withReply(caught(), { primer: null, ask: ["a", "b"] }, AT)
    if (twice === null) throw new Error("kept")
    expect(twice.asked?.map((each) => each.id)).toEqual(["ask-1", "ask-2"])
    expect(twice.asked?.every((each) => isFollowUp(each.id))).toBe(true)
    expect(readReply(replyText({ ask: ["c", "d"] }), twice).ok).toBe(false)
    expect(readReply(replyText({ ask: ["c"] }), twice).ok).toBe(true)
    expect(withReply(twice, { primer: null, ask: ["c", "d"] }, AT)).toBeNull()
  })
})
