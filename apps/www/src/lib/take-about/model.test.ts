/** @vitest-environment node */
import { describe, expect, it } from "vitest"

import type { Note } from "@/lib/episode-feedback/model"

import type { AboutSources } from "./model"
import { aboutOf, NO_SOURCES } from "./model"

const NOTE: Note = {
  id: "n1",
  feed: "call",
  episode: "2026-11-06",
  atMs: 192_000,
  categories: ["pacing", "voice"],
  writtenAt: "2026-11-14T09:00:00.000Z",
  take: "t-note",
}

const SOURCES: AboutSources = {
  notes: [NOTE],
  videos: new Map([["v1", { title: "The essay", scenes: ["s1", "s2", "s3"] }]]),
  ideas: new Map([
    ["i1", { title: "Typing rounds", asked: new Map([["ask-1", "Why now?"]]) }],
  ]),
  spoken: new Map([["scabc12", "How I built Rust Rounds"]]),
}

describe("what each take was said for, from what the phone keeps (TAKES2)", () => {
  it("names a note's take by its feed, episode, moment and picks, whatever its ref", () => {
    const about = aboutOf("t-note", "take:t-note", SOURCES)
    expect(about).toMatchObject({
      kind: "note",
      feed: "The weekly call",
      atMs: 192_000,
      picks: ["Pacing", "The voice"],
    })
    // One home doesn't have yet has no ref, and is still the note's.
    expect(aboutOf("t-note", null, SOURCES)?.kind).toBe("note")
  })

  it("names a scene by its video and place in it", () => {
    expect(aboutOf("x", "v1:s3:take-2", SOURCES)).toEqual({
      kind: "scene",
      video: "The essay",
      scene: 3,
    })
    expect(aboutOf("x", "gone:s3:take-2", SOURCES)).toEqual({
      kind: "scene",
      video: null,
      scene: null,
    })
  })

  it("names an idea, and a question it asked back (its own are Studio's words)", () => {
    expect(aboutOf("x", "idea:i1:what", SOURCES)).toEqual({
      kind: "idea",
      idea: "Typing rounds",
      question: null,
    })
    expect(aboutOf("x", "idea:i1:ask-1", SOURCES)).toMatchObject({
      question: "Why now?",
    })
    expect(aboutOf("x", "idea:other:ask-1", NO_SOURCES)).toEqual({
      kind: "idea",
      idea: null,
      question: null,
    })
  })

  it("names an answer to an ask by the ask's number (C1097)", () => {
    expect(aboutOf("x", "ask:some-ui-2876", SOURCES)).toEqual({
      kind: "ask",
      ask: null,
      number: 2876,
    })
  })

  it("names a spoken card's take by the card's title while this phone keeps it (#3339)", () => {
    expect(aboutOf("x", "spoken:scabc12.1", SOURCES)).toEqual({
      kind: "spoken",
      card: "scabc12",
      title: "How I built Rust Rounds",
      part: 1,
    })
    expect(aboutOf("x", "spoken:scabc12.1", NO_SOURCES)).toMatchObject({
      kind: "spoken",
      title: null,
    })
  })

  it("knows nothing more of a take recorded on Takes than its ref says", () => {
    expect(aboutOf("x", "take:x", SOURCES)).toBeNull()
    expect(aboutOf("x", null, SOURCES)).toBeNull()
  })
})
