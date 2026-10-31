import type { ResponseKind, SessionFile } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"
import { describe, expect, it } from "vitest"

import {
  lintSessionFile,
  negativeDiscriminationGaps,
  roundsWithoutNamedReturns,
} from ".."
import { AB_FIXTURES } from "./fixtures"

const source = {
  title: "Paxos Made Simple",
  author: "Lamport",
  year: 2001,
  where: "§2.2, p. 2",
  url: "https://lamport.azurewebsites.net/pubs/paxos-simple.pdf",
  minutes: 3,
}

/** One round that keeps every content obligation. */
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

  it("reports a struggle that can leave the session from an info screen", () => {
    const file = clean()
    file.screens.why = {
      type: "info",
      body: "Not this one.",
      actions: [{ label: "Go on", next: "p1" }, { label: "Leave" }],
    }
    const round = file.screens.r1
    if (round?.type === "choice") round.onHesitate = "why"
    expect(codes(file)).toEqual(["struggle-without-reading"])
  })

  it("matches the correct option as a word, not inside another", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type === "choice") {
      round.options = [
        { label: "3", next: "end", correct: true },
        { label: "2", next: "p1", feedback: "13 nodes would still disagree." },
        { label: "Not sure", next: "p1", abstain: true },
      ]
    }
    expect(lintSessionFile(file)).toEqual([])
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

  it("reports a placed reading whose in-app core runs over three minutes", () => {
    const file = clean()
    const reading = file.screens.p1
    if (reading?.type === "reading") {
      reading.source.minutes = 12
      expect(lintSessionFile(file)).toEqual([])
      reading.passage = "word ".repeat(460)
    }
    expect(codes(file)).toEqual(["long-placement"])
  })

  it("counts a reading as placed when a struggle reaches it, tagged or not", () => {
    const file = clean()
    const reading = file.screens.p1
    if (reading?.type === "reading") {
      reading.tags = []
      reading.passage = "word ".repeat(460)
    }
    expect(codes(file)).toEqual(["long-placement"])
  })

  it("follows a slow correct pick where the correct option goes", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type === "choice") delete round.onHesitate
    expect(lintSessionFile(file)).toEqual([
      expect.objectContaining({
        code: "struggle-without-reading",
        message: expect.stringContaining('"end"'),
      }),
    ])
  })

  it("reports a round without exactly one abstention", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    const abstention = round.options.pop()
    expect(codes(file)).toEqual(["round-without-abstention"])
    if (abstention) round.options.push(abstention, { ...abstention })
    expect(codes(file)).toEqual(["round-without-abstention"])
  })

  it("finds a glossed term's plural", () => {
    const file = clean()
    file.start = "intro"
    file.screens.intro = {
      type: "info",
      body: "Today: quorums.",
      actions: [{ label: "Start", next: "r1" }],
    }
    expect(codes(file)).toEqual(["unglossed-term"])
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

  it("reads a return's new numbers in its panel, not only its body", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    round.panel = { rows: [{ who: "n1", holds: "x = 1" }] }
    file.screens.r1b = {
      ...round,
      returnOf: "r1",
      panel: { rows: [{ who: "n1", holds: "x = 2" }] },
    }
    const reading = file.screens.p1
    if (reading?.type === "reading") {
      reading.actions = [{ label: "Read now", next: "r1b", effect: "read" }]
    }
    expect(lintSessionFile(file)).toEqual([])
  })

  it("lets a return use a term its round glossed", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    file.screens.r1b = {
      ...round,
      glosses: [],
      returnOf: "r1",
      body: "Seven nodes; three may crash. How big is a quorum?",
    }
    expect(lintSessionFile(file)).toEqual([])
  })

  /** `clean()` with a return of r1 for each response named, new numbers each. */
  function withReturns(
    returnFor: ReadonlyArray<ResponseKind | undefined>
  ): SessionFile {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    returnFor.forEach((kind, index) => {
      const nodes = String(7 + 2 * index)
      file.screens[`r1-${String(index)}`] = {
        ...round,
        returnOf: "r1",
        ...(kind === undefined ? {} : { returnFor: kind }),
        body: `${nodes} nodes; some may crash. How big is a quorum?`,
      }
    })
    return file
  }

  it("reports a round whose returns name some responses and not each (Prop. 9.1)", () => {
    expect(lintSessionFile(withReturns(["incorrect"]))).toEqual([
      {
        code: "response-without-return",
        screen: "r1",
        message:
          'no return names "abstain", "hesitate" in `returnFor`; each response gets its own follow-up (Prop. 9.1, Rem. 11.9)',
      },
    ])
    expect(codes(withReturns(["incorrect", undefined]))).toEqual([
      "response-without-return",
    ])
    expect(
      lintSessionFile(withReturns(["incorrect", "abstain", "hesitate"]))
    ).toEqual([])
  })

  it("owes no incorrect return where every option is the answer or the abstention", () => {
    const file = withReturns(["abstain", "hesitate"])
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    round.options = round.options.filter(
      (option) => option.correct || option.abstain
    )
    expect(lintSessionFile(file)).toEqual([])
  })

  it("leaves a round with no return naming a response unchecked, and lists it", () => {
    const file = withReturns([undefined])
    expect(lintSessionFile(file)).toEqual([])
    // The returns are rounds too, and are not listed.
    expect(roundsWithoutNamedReturns(file)).toEqual(["r1"])
    expect(roundsWithoutNamedReturns(withReturns(["incorrect"]))).toEqual([])
    // A round with no return at all.
    expect(lintSessionFile(clean())).toEqual([])
    expect(roundsWithoutNamedReturns(clean())).toEqual(["r1"])
  })

  it("reports a return naming a response its round cannot produce, or returning no round", () => {
    const file = withReturns(["incorrect", "abstain", "hesitate"])
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    round.options = round.options.filter(
      (option) => option.correct || option.abstain
    )
    expect(lintSessionFile(file)).toEqual([
      {
        code: "mismatched-return-for",
        screen: "r1-0",
        message:
          'follows "incorrect", which r1\'s options cannot produce (Prop. 9.1, Rem. 11.9)',
      },
    ])

    const choice = clean()
    choice.screens.ask = {
      type: "choice",
      options: [
        { label: "Yes", next: "end" },
        { label: "No", next: "end" },
      ],
    }
    choice.screens.again = {
      type: "choice",
      returnOf: "ask",
      returnFor: "abstain",
      options: [
        { label: "Yes", next: "end" },
        { label: "No", next: "end" },
      ],
    }
    expect(lintSessionFile(choice)).toEqual([
      {
        code: "mismatched-return-for",
        screen: "again",
        message:
          "names the response it follows, but ask is not a round (Prop. 9.1, Rem. 11.9)",
      },
    ])
  })

  it("reports a rubric covering what is not a round, or a return (Rem. 11.10)", () => {
    const withTake = (
      rubric: ReadonlyArray<unknown>,
      file: SessionFile = clean()
    ): SessionFile =>
      SessionFileSchema.parse({
        ...file,
        screens: {
          ...file.screens,
          t1: {
            type: "record",
            prompt: "How big is a quorum of five, and why?",
            maxSeconds: 60,
            rubric,
            weakIfFewerThan: 1,
            next: "end",
            onWeak: "p1",
          },
        },
      })
    // Known coverage naming a round, and unknown coverage, both pass.
    expect(
      lintSessionFile(
        withTake([
          { text: "Three", covers: ["r1"] },
          { text: "Any two meet", covers: [] },
        ])
      )
    ).toEqual([])
    expect(lintSessionFile(withTake(["Three", "Any two meet"]))).toEqual([])

    expect(
      lintSessionFile(
        withTake([
          { text: "Three", covers: ["r1", "p1", "nowhere"] },
          { text: "Any two meet", covers: [] },
        ])
      )
    ).toEqual([
      {
        code: "covers-not-a-round",
        screen: "t1",
        message:
          'a rubric point covers "p1", which is not a round of this file',
      },
      {
        code: "covers-not-a-round",
        screen: "t1",
        message:
          'a rubric point covers "nowhere", which is not a round of this file',
      },
    ])

    // A return, by `returnOf` or by its tag, is the round's, and never parks.
    const returns = withReturns([undefined])
    const round = returns.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    returns.screens.again = {
      ...round,
      tags: ["parked-return"],
      body: "Nine nodes; four may crash. How big is a quorum?",
    }
    const findings = lintSessionFile(
      withTake([{ text: "Three", covers: ["r1-0", "again"] }], returns)
    )
    for (const id of ["r1-0", "again"]) {
      expect(findings).toContainEqual({
        code: "covers-not-a-round",
        screen: "t1",
        message: `a rubric point covers "${id}", which is a return; cover the round it returns`,
      })
    }
  })

  it.each([
    { body: "You read two sources." },
    { title: "Two sources read" },
    { pinned: "Two sources read" },
  ])("reports an end screen with authored text: %j", (text) => {
    const file = clean()
    file.screens.end = { type: "end", ...text }
    expect(codes(file)).toEqual(["authored-ledger"])
  })

  it("resolves rule and applies against Rem. 7.4, naming the register", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    round.rule = "A99"
    round.options[1] = { ...round.options[1]!, applies: "M42" }
    expect(lintSessionFile(file)).toEqual([
      {
        code: "unregistered-rule",
        screen: "r1",
        message: `"A99" is in no row of canon Rem. 7.4's Agreement register`,
      },
      {
        code: "unregistered-rule",
        screen: "r1",
        message: `"M42" is in no row of canon Rem. 7.4's Machine register`,
      },
    ])
  })

  it("reports a round that names no rule, and a correct option applying another", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    round.options[0] = { ...round.options[0]!, applies: "A5" }
    expect(codes(file)).toEqual(["correct-applies-other-rule"])
    delete round.rule
    expect(codes(file)).toContain("round-without-rule")
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

describe("negativeDiscriminationGaps", () => {
  it("owes every live entry a round another entry decides, where an option applies it", () => {
    const file = clean()
    const round = file.screens.r1
    if (round?.type !== "choice") throw new Error("r1 is a choice")
    round.options[1] = { ...round.options[1]!, applies: "A9" }
    // A correct option is never a distractor, whatever it applies.
    round.options[0] = { ...round.options[0]!, applies: "A5" }
    expect(negativeDiscriminationGaps([file])).not.toContain("A9")
    expect(negativeDiscriminationGaps([file])).toContain("A5")
    // A wrong option applying the round's own rule, or any option on a round
    // that names no rule, discriminates nothing.
    round.options[1] = { ...round.options[1], applies: "A3" }
    expect(negativeDiscriminationGaps([file])).toContain("A3")
    round.options[1] = { ...round.options[1], applies: "A9" }
    delete round.rule
    expect(negativeDiscriminationGaps([file])).toContain("A9")
    // Nor does a round no path from the start reaches.
    round.rule = "A3"
    file.start = "p1"
    expect(negativeDiscriminationGaps([file])).toContain("A9")
  })
})
