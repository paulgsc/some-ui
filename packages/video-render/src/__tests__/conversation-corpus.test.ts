/**
 * The corpus home's step is held to (HOST16-S, paulgsc/server#1243): the
 * same every time it is made, and reaching every refusal home holds, so an
 * edit to the alphabet that drops one fails here rather than leaving the
 * server's parity test asserting nothing about it.
 */
import { NEW_CONVERSATION, stepConversation } from "@video-render/conversation"
import {
  CONVERSATION_CORPUS_SCHEMA,
  conversationCorpus,
  CORPUS_ALPHABET,
} from "@video-render/conversation-corpus"
import { describe, expect, it } from "vitest"

/** The refusals home's step holds (paulgsc/server `conversation_repo::step::Refusal`), but `too-many-points`, which forty points away no walk reaches. */
const HELD = [
  "stale",
  "author",
  "out-of-phase",
  "point-again",
  "version-number",
  "unanswered",
  "answer-unknown",
  "answer-twice",
  "answer-kinds",
  "flag-again",
  "flag-version",
  "turn-unknown",
  "flag-not-open",
  "heard-version",
  "heard-again",
  "unheard",
  "too-long",
  "green-light-version",
  "notes-turn",
  "notes-word",
  "notes-rule",
  "offer-again",
  "preview-unknown",
  "preview-variant",
  "moves-unknown",
  "preview-again",
  "rule-again",
] as const

describe("the conversation corpus", () => {
  const corpus = conversationCorpus()

  it("is the same every time it is made", () => {
    expect(JSON.stringify(conversationCorpus())).toBe(JSON.stringify(corpus))
    expect(corpus.schema).toBe(CONVERSATION_CORPUS_SCHEMA)
  })

  it("names each case once, by a path the step takes", () => {
    const ids = new Set(corpus.cases.map((c) => c.id))
    expect(ids.size).toBe(corpus.cases.length)
    for (const c of corpus.cases.slice(0, 200)) {
      let state = NEW_CONVERSATION
      for (const name of c.path) {
        const event = CORPUS_ALPHABET[name]
        expect(event).toBeDefined()
        if (event === undefined) return
        const stepped = stepConversation(state, event)
        expect(stepped.ok).toBe(true)
        if (!stepped.ok) return
        state = stepped.state
      }
    }
  })

  it("reaches every refusal home holds, and takes some events", () => {
    const whys = new Set(corpus.cases.map((c) => c.refusal?.why ?? "ok"))
    const missing = HELD.filter((why) => !whys.has(why))
    expect(missing).toEqual([])
    expect(whys.has("ok")).toBe(true)
  })
})
