/**
 * What Jobs' Today says is said in the person's terms, and none of it names
 * the machinery. Every word in the table is sampled here, so a new one
 * cannot skip the check.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Progress } from "@/lib/jobs/model"
import * as words from "@/lib/jobs/words"

const DAY = "2026-10-18"

const SAID: Readonly<Record<keyof typeof words, ReadonlyArray<string>>> = {
  notToday: [words.notToday(DAY)],
  newerHeld: [words.newerHeld(DAY)],
  arriveOnTheirOwn: [words.arriveOnTheirOwn],
  openFromStorage: [words.openFromStorage],
  orOpenFile: [words.orOpenFile],
  doneToday: [0, 1, 4].map(words.doneToday),
  allDone: [words.allDone],
  pickedForYou: [words.pickedForYou],
  fitWord: [0.9, 0.6, 0.3].map(words.fitWord),
  readyHeading: [words.readyHeading],
  resumeToSend: [words.resumeToSend("backend")],
  coverLetterDrafted: [words.coverLetterDrafted],
  answersDrafted: [1, 3].map(words.answersDrafted),
  detailsToPaste: [1, 4].map(words.detailsToPaste),
  openIt: [words.openIt],
  seeAll: [true, false].map(words.seeAll),
  howPicked: [words.howPicked],
  pickedFrom: [words.pickedFrom(DAY, 42, 5, 14)],
  holdsPlace: [words.holdsPlace],
  stillOpen: [words.stillOpen(["2 of 3 software", "1 of 2 adjacent"])],
  leftOut: [words.leftOut(true, 14), words.leftOut(false, 14)],
  noPicksYet: [words.noPicksYet],
  whatMorningsBring: [words.whatMorningsBring(3, 2)],
  trackHeading: Object.values(words.trackHeading),
  pickState: (
    [
      { kind: "open", step: 0 },
      { kind: "open", step: 3 },
      { kind: "passed" },
      { kind: "archived" },
      { kind: "done", result: "submitted" },
      { kind: "done", result: "gave-up" },
    ] satisfies ReadonlyArray<Progress>
  ).map((progress) => words.pickState(progress)),
  breaksRules: [words.breaksRules(1, "a pick has no link to apply")],
  heldOver: [words.heldOver(1, false), words.heldOver(3, true)],
  letGoLabel: [words.letGoLabel(1, null), words.letGoLabel(3, DAY)],
  letGoAsk: [1, 3].map(words.letGoAsk),
  letGoWhat: [words.letGoWhat],
  letGoConfirm: [words.letGoConfirm],
  letGoKeep: [words.letGoKeep],
  wouldHavePicked: [words.wouldHavePicked],
  saidWouldHavePicked: [words.saidWouldHavePicked],
  whyItFits: [words.whyItFits],
  keepWhy: [words.keepWhy],
}

describe("Jobs' words", () => {
  it("never name the machinery", () => {
    const said = Object.values(SAID).flat()
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("count what is done, and say a fit in words", () => {
    expect(SAID.doneToday).toEqual([
      "Today: nothing yet, and that’s fine.",
      "Today: one thing done.",
      "Today: 4 things done.",
    ])
    expect(SAID.fitWord).toEqual(["Strong fit", "Good fit", "A stretch"])
  })
})
