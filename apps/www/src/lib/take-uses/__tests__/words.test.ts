/**
 * @vitest-environment node
 *
 * What a take's uses say (INUSE): every use named in the owner's terms, and
 * never the machinery.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { TakeUse } from "@/lib/take-uses/model"
import { USE_SOURCES } from "@/lib/take-uses/model"
import { USE_WORDS, weekName, whatLoses } from "@/lib/take-uses/words"

const EVERY_USE: ReadonlyArray<TakeUse> = [
  { kind: "spoken", card: "c1", title: "Who I am", part: 2 },
  { kind: "spoken", card: "c1", title: " ", part: 1 },
  { kind: "scene", video: "v1", title: "Pager", shot: "b", scene: 3 },
  { kind: "scene", video: "v1", title: "Pager", shot: "z", scene: null },
  { kind: "queued", video: "v1", title: "Pager", rev: 2, shot: "b", scene: 3 },
  { kind: "queued", video: "v1", title: "", rev: 2, shot: "z", scene: null },
  { kind: "idea", idea: "i1", title: "Phones", question: "what" },
  { kind: "idea", idea: "i1", title: null, question: "what" },
  {
    kind: "home",
    video: "essay",
    key: "e1",
    title: "Who I am",
    withdraws: true,
  },
  {
    kind: "home",
    video: "studio-video",
    key: "v1",
    title: "",
    withdraws: false,
  },
  { kind: "home", video: "other", key: "o1", title: "", withdraws: true },
  { kind: "interview", week: "2026-w47", as: "answer" },
  { kind: "interview", week: "2026-w47", as: "read" },
  { kind: "rust", week: "2026-w06", as: "answer" },
  { kind: "rust", week: "2026-w06", as: "opening" },
]

describe("a take's uses, in words", () => {
  it("say what uses it and what that loses, for every use", () => {
    expect(USE_WORDS.markName(1)).toBe("In use: 1 thing")
    expect(USE_WORDS.markName(2)).toBe("In use: 2 things")
    expect(whatLoses(EVERY_USE[2])).toMatch(/^Scene 3 of “Pager”/u)
    expect(whatLoses(EVERY_USE[1])).toMatch(/its spoken card/u)
    expect(whatLoses(EVERY_USE[13])).toMatch(/Rust Rounds week 6\./u)
    expect(whatLoses(EVERY_USE[8])).toMatch(
      /^“Who I am” on home plays it\. Home withdraws/u
    )
    expect(whatLoses(EVERY_USE[9])).toBe(
      "A Studio video, a Studio video home holds, has it. If home hasn't made it yet, it can't with this take gone."
    )
    expect(whatLoses(EVERY_USE[4])).toBe(
      "Version 2 of “Pager”, which you finished for home to make, has it as scene 3's take. If home hasn't made that version yet, it can't with this take gone."
    )
    expect(whatLoses(EVERY_USE[0])).toMatch(/^Part 2 of “Who I am” plays it\./u)
    expect(weekName("odd")).toBe("the week odd")
  })

  it("never name the machinery", () => {
    const said = [
      ...EVERY_USE.map((use) => whatLoses(use)),
      USE_WORDS.markName(1),
      USE_WORDS.markName(3),
      USE_WORDS.uncheckedName,
      USE_WORDS.title(1, 1),
      USE_WORDS.title(3, 3),
      USE_WORDS.title(4, 2),
      USE_WORDS.inUseTitle,
      USE_WORDS.changed,
      USE_WORDS.unreadSince,
      USE_WORDS.markOf(USE_WORDS.markName(1), "the recording of today"),
      USE_WORDS.confirm(1),
      USE_WORDS.confirm(3),
      USE_WORDS.checking,
      USE_WORDS.checkingTitle,
      USE_WORDS.uncheckedTitle,
      USE_WORDS.unread(USE_SOURCES),
      USE_WORDS.unread(["videos"]),
      USE_WORDS.unused(1),
      USE_WORDS.unused(2),
    ]
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
    expect(
      said.filter((text) => /\bid\b|undefined|null|NaN/u.test(text))
    ).toEqual([])
  })

  it("list the stores it couldn't read as a sentence", () => {
    expect(USE_WORDS.unread(["videos", "ideas", "rust"])).toBe(
      "This phone can't read all of your Studio videos, ideas and Rust Rounds weeks, so it can't say whether one of them uses it."
    )
  })
})
