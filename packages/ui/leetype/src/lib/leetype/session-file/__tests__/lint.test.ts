import type { SessionFile } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"
import { describe, expect, it } from "vitest"

import { lintSessionFile } from ".."
import { AB_FIXTURES } from "./fixtures"

const source = {
  title: "Paxos Made Simple",
  author: "Lamport",
  year: 2001,
  where: "§2.2, p. 2",
  url: "https://lamport.azurewebsites.net/pubs/paxos-simple.pdf",
  minutes: 3,
}

/**
 * One round that keeps every content obligation: it cites its passage, its
 * struggles land on a short placed reading, its feedback never names the
 * answer, its one term is glossed where it is first used, and its end
 * screen is not written ahead.
 */
function clean(): SessionFile {
  return SessionFileSchema.parse({
    title: "A session",
    oneLine: "One round.",
    session: { kind: "probe", budgetMinutes: 5 },
    glossary: { quorum: "A set of nodes large enough to decide." },
    start: "r1",
    screens: {
      r1: {
        type: "choice",
        pinned: "Pick how many nodes must agree.",
        body: "Five nodes; two may crash. How big is a quorum?",
        glosses: ["quorum"],
        rule: "A3",
        cites: "p1",
        options: [
          { label: "Three", next: "end", correct: true },
          {
            label: "Two",
            next: "p1",
            feedback: "Two quorums could be disjoint.",
          },
          { label: "Not sure", next: "p1", abstain: true },
        ],
        onHesitate: "p1",
      },
      p1: {
        type: "reading",
        primer: "What would break if two such sets could be disjoint?",
        source,
        tags: ["placement"],
        actions: [{ label: "Read now", next: "end", effect: "read" }],
      },
      end: { type: "end" },
    },
  })
}

function codes(file: SessionFile): Array<string> {
  return lintSessionFile(file).map((finding) => finding.code)
}

describe("lintSessionFile", () => {
  it("finds nothing in a session that keeps every obligation", () => {
    expect(lintSessionFile(clean())).toEqual([])
  })

  it("reports a round that cites no passage", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type === "choice") delete round.cites
    expect(codes(file)).toEqual(["uncited-round"])
  })

  it("reports a struggle that reaches the end without a reading", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type === "choice") round.onHesitate = "end"
    expect(lintSessionFile(file)).toEqual([
      expect.objectContaining({
        code: "struggle-without-reading",
        screen: "r1",
      }),
    ])
  })

  it("passes a struggle through info screens to its reading", () => {
    const file = clean()
    file.screens.why = {
      type: "info",
      body: "Not this one.",
      actions: [{ label: "Go on", next: "p1" }],
    }
    const round = file.screens.r1
    if (round?.type === "choice") round.onHesitate = "why"
    expect(lintSessionFile(file)).toEqual([])
  })

  it("reports feedback that names the correct option", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type === "choice") {
      round.options[1] = {
        label: "Two",
        next: "p1",
        feedback: "No: the answer is three.",
      }
    }
    expect(codes(file)).toEqual(["feedback-names-answer"])
  })

  it("reports a term used before any screen on the way glosses it", () => {
    const file = clean()
    file.start = "intro"
    file.screens.intro = {
      type: "info",
      body: "Today: what makes a quorum.",
      actions: [{ label: "Start", next: "r1" }],
    }
    expect(lintSessionFile(file)).toEqual([
      expect.objectContaining({ code: "unglossed-term", screen: "intro" }),
    ])
  })

  it("reports a placed reading longer than three minutes", () => {
    const file = clean()
    const reading = file.screens.p1
    if (reading?.type === "reading") reading.source.minutes = 8
    expect(codes(file)).toEqual(["long-placement"])
  })

  it("reports a return that repeats its round's situation", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    file.screens.r1b = { ...round, returnOf: "r1" }
    const reading = file.screens.p1
    if (reading?.type === "reading") {
      reading.actions = [{ label: "Read now", next: "r1b", effect: "read" }]
    }
    expect(codes(file)).toEqual(["verbatim-return"])

    file.screens.r1b = {
      ...round,
      returnOf: "r1",
      body: "Seven nodes; three may crash. How big is a quorum?",
    }
    expect(lintSessionFile(file)).toEqual([])
  })

  it("reports an end screen with authored text", () => {
    const file = clean()
    file.screens.end = { type: "end", body: "You read two sources today." }
    expect(codes(file)).toEqual(["authored-ledger"])
  })

  it.each(AB_FIXTURES)(
    "reads the A/B's variant $variant as the A/B found it: no round cites its passage, and the end is authored",
    ({ raw }) => {
      const found = new Set(codes(SessionFileSchema.parse(raw)))
      expect(found).toContain("uncited-round")
      expect(found).toContain("authored-ledger")
    }
  )
})
