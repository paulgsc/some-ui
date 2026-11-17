/**
 * SIGNIN1's words: each look of the sign-in mark says where the phone is
 * signed in and since when, in the person's terms, never the machinery.
 */
import { describe, expect, it } from "vitest"

import type {
  HomeLinkEvent,
  HomeLinkState,
  PairFailure,
} from "@/lib/home-link/model"
import { INITIAL, step } from "@/lib/home-link/model"
import {
  PAIR_FORM,
  pairFailureLine,
  SIGN_IN,
  signInView,
  UNPAIRED_NOTES,
  WELCOME,
} from "@/lib/home-link/sign-in-words"

import { MACHINERY } from "./machinery"

const BASE = "https://home.example/api/v1"
const WHEN = {
  day: (): string => "17 Nov 2026",
  moment: (): string => "17 Nov, 9:30",
}

const run = (...events: ReadonlyArray<HomeLinkEvent>): HomeLinkState =>
  events.reduce(step, INITIAL)
const READ = (since: number | null): HomeLinkEvent => ({
  type: "read",
  found: { base: BASE, id: "p1", since },
})

const LOOKS: Record<string, HomeLinkState> = {
  reading: INITIAL,
  out: run({ type: "read", found: null }),
  outLost: run({ type: "read", found: "lost" }),
  in: run(READ(1), { type: "heard", id: "p1", known: true, at: 2 }),
  inBefore: run(READ(null)),
  away: run(READ(1), { type: "unanswered", now: 3 }),
  lost: run(READ(1), { type: "heard", id: "p1", known: false, at: 4 }),
}

describe("the sign-in mark's words", () => {
  it("say signed in at home's host, and since the day it paired", () => {
    expect(signInView(LOOKS.in, WHEN)).toMatchObject({
      signedIn: "in",
      line: "Signed in to home at home.example, since 17 Nov 2026.",
    })
    // A pairing kept before the day was kept says no day.
    expect(signInView(LOOKS.inBefore, WHEN).line).toBe(
      "Signed in to home at home.example."
    )
  })

  it("say what stays on the phone when not signed in, or no longer", () => {
    const out = signInView(LOOKS.out, WHEN)
    expect(out).toMatchObject({ signedIn: "out", action: SIGN_IN.pair })
    expect(out.notes).toContain("What you do stays on this phone.")
    expect(signInView(LOOKS.outLost, WHEN).notes).toContain(UNPAIRED_NOTES.lost)
    const lost = signInView(LOOKS.lost, WHEN)
    expect(lost).toMatchObject({
      signedIn: "lost",
      line: "Home didn't know this phone when the phone last asked, on 17 Nov, 9:30.",
      action: SIGN_IN.pairAgain,
    })
  })

  it("say home isn't answering, and still signed in, while away", () => {
    expect(signInView(LOOKS.away, WHEN)).toMatchObject({
      signedIn: "away",
      line: "Signed in to home at home.example, since 17 Nov 2026.",
    })
  })

  it("never name the machinery", () => {
    for (const state of Object.values(LOOKS)) {
      const view = signInView(state, WHEN)
      for (const words of [view.label, view.line, view.action, ...view.notes]) {
        expect(words).not.toMatch(MACHINERY)
      }
    }
    for (const words of [
      ...Object.values(SIGN_IN),
      ...Object.values(UNPAIRED_NOTES),
    ]) {
      expect(words).not.toMatch(MACHINERY)
    }
  })

  it("say pairing's failures, the form and the welcome in the person's terms", () => {
    const failures: ReadonlyArray<PairFailure> = [
      "unreachable",
      "untrusted",
      "bad-code",
      "too-many",
      "not-set-up",
      "not-home",
      "not-kept",
      "other",
    ]
    const words = [
      ...failures.map((failure) => pairFailureLine(failure, "home.example")),
      ...Object.values(PAIR_FORM).map((word) =>
        typeof word === "function" ? word("home.example") : word
      ),
      WELCOME.title,
      WELCOME.lead,
      WELCOME.restored,
      WELCOME.notNow,
      WELCOME.notNowNote,
      ...WELCOME.steps,
    ]
    for (const word of words) {
      expect(word.replace(/home\.example/g, "home")).not.toMatch(MACHINERY)
    }
  })
})
