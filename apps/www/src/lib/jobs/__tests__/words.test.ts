/**
 * What Jobs' Today says is said in the person's terms, and none of it names
 * the machinery. Every word in the table is sampled here, so a new one
 * cannot skip the check.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Standing } from "@/lib/jobs/model"
import * as words from "@/lib/jobs/words"

const DAY = "2026-10-18"

const SAID: Readonly<Record<keyof typeof words, ReadonlyArray<string>>> = {
  notToday: [words.notToday(DAY)],
  newerHeld: [words.newerHeld(DAY)],
  arriveOnTheirOwn: [words.arriveOnTheirOwn],
  openFromStorage: [words.openFromStorage],
  orOpenFile: [words.orOpenFile],
  doneToday: [1, 4].map(words.doneToday),
  allDone: [words.allDone],
  pickedForYou: [words.pickedForYou],
  fitWord: [0.9, 0.6, 0.3].map(words.fitWord),
  readyHeading: [words.readyHeading],
  resumeInHand: [words.resumeInHand("backend")],
  resumeToBuild: [words.resumeToBuild("backend")],
  coverLetterDrafted: [words.coverLetterDrafted],
  answersDrafted: [1, 3].map(words.answersDrafted),
  detailsToPaste: [1, 4].map(words.detailsToPaste),
  openIt: [words.openIt],
  seeAll: [true, false].map(words.seeAll),
  howPicked: [words.howPicked],
  pickedFrom: [words.pickedFrom(DAY, 42, 5, 14)],
  holdsPlace: [words.holdsPlace],
  openOfTrack: [
    words.openOfTrack("software", 2, 3),
    words.openOfTrack("adjacent", 1, 2),
  ],
  stillOpen: [words.stillOpen(["2 of 3 software roles"])],
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
      { kind: "lapsed", on: DAY },
    ] satisfies ReadonlyArray<Standing>
  ).map((progress) => words.pickState(progress)),
  breaksRules: [words.breaksRules(1, "a pick has no link to apply")],
  heldOver: [words.heldOver(1, false), words.heldOver(3, true)],
  lapsedEarlier: [1, 3].map(words.lapsedEarlier),
  lapsedOn: [words.lapsedOn(DAY)],
  lapsedBeforeHeard: [1, 2].map(words.lapsedBeforeHeard),
  lapsedList: [words.lapsedList(true, 4), words.lapsedList(false, 4)],
  itArrived: [words.itArrived],
  shareAgain: [words.shareAgain],
  wouldHavePicked: [words.wouldHavePicked],
  saidWouldHavePicked: [words.saidWouldHavePicked],
  whyItFits: [words.whyItFits],
  keepWhy: [words.keepWhy],
  readIt: [words.readIt],
  sendIt: [words.sendIt],
  notForMe: [words.notForMe],
  steps: [...words.steps],
  whatTheyWant: [words.whatTheyWant],
  whereIFit: [words.whereIFit],
  dontClaim: [words.dontClaim],
  onToDecide: [words.onToDecide],
  passLabels: Object.values(words.passLabels),
  passedIt: [words.passedIt],
  sendAfterAll: [words.sendAfterAll],
  archivedIt: [words.archivedIt],
  decideHint: [words.decideHint],
  sayWhyNot: [words.sayWhyNot],
  whyNot: [words.whyNot],
  inAFewWords: [words.inAFewWords],
  sayWhyAloud: [words.sayWhyAloud],
  notForMeWithWhy: [words.notForMeWithWhy],
  endingLabels: Object.values(words.endingLabels),
  howDidItEnd: [words.howDidItEnd],
  addHowItWent: [words.addHowItWent],
  howItWentHint: [words.howItWentHint],
  howLong: [words.howLong],
  minutesRange: [words.minutesRange(600)],
  frictionHeading: [words.frictionHeading],
  frictionScale: [words.frictionScale],
  whatGotInTheWay: [words.whatGotInTheWay],
  frictionLabels: Object.values(words.frictionLabels),
  whatHappened: [words.whatHappened],
  sayItAloud: [words.sayItAloud],
  endedAs: (["submitted", "gave-up", "closed"] as const).map(words.endedAs),
}

describe("Jobs' words", () => {
  it("never name the machinery", () => {
    const said = Object.values(SAID).flat()
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("name each ending as the one-tap buttons do, never by its stored name", () => {
    expect(SAID.endedAs).toEqual([
      "Ended: Sent. Add replies and interviews under Record as they come.",
      "Ended: Stopped partway. Add replies and interviews under Record as they come.",
      "Ended: Couldn’t: posting closed. Add replies and interviews under Record as they come.",
    ])
  })

  it("say a fit in words, from a strong fit down to a stretch", () => {
    expect(SAID.fitWord).toEqual(["Strong fit", "Good fit", "A stretch"])
  })
})
