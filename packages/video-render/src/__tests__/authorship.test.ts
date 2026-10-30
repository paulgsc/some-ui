import {
  authorshipOf,
  authorshipParams,
  handsOf,
  wordingOf,
} from "@video-render/authorship"
import type { CutList, Shot } from "@video-render/cut-list"
import { parseCutList } from "@video-render/cut-list"
import { STEPS } from "@video-render/steps"
import type { Step } from "@video-render/steps"
import { place } from "@video-render/timing"
import { describe, expect, it } from "vitest"

import { cutList, shot } from "./fixtures"

const take = { file: "takes/01.webm", inMs: 0, outMs: 1000 }
const card = { kind: "card" } as const
const bare = (id: string): Shot => shot(id, { picture: card })

/** The four idea paths, each over a different set of hands. */
const PATHS: ReadonlyArray<Shot> = [
  // you: the owner's idea in the owner's words.
  shot("you", {
    idea: { origin: "you", from: { kind: "voice-note", id: "vn-7" } },
    take,
    voice: "ad-lib",
  }),
  // you -> agent: the owner's idea, read in an agent's words.
  shot("you-agent", {
    idea: { origin: "you", from: { kind: "prompt", id: "chat-3" } },
    take,
    voice: "read",
    overrides: { transitionIn: "cut" },
  }),
  // agent: on a card, no take.
  bare("agent"),
  // agent -> you: an agent's idea said in the owner's words.
  shot("agent-you", { take, voice: "ad-lib" }),
  // source: cited, worded by an agent.
  shot("source", {
    idea: { origin: "source", from: { title: "NFL rulebook", ref: "8.4" } },
    picture: card,
    overrides: { transitionIn: "cut" },
  }),
]

describe("authorship", () => {
  it("reads each scene's idea path and hands from the data", () => {
    const cut = cutList(PATHS, { voice: "mixed" })
    expect(
      authorshipOf(cut).map((a) => [
        a.shot,
        a.origin,
        a.wording,
        a.hands.join("+"),
      ])
    ).toEqual([
      ["you", "you", "you", "you+code"],
      ["you-agent", "you", "agent", "you+agent+code"],
      ["agent", "agent", "agent", "code"],
      ["agent-you", "agent", "you", "you+code"],
      ["source", "source", "agent", "agent+code"],
    ])
  })

  it("never says the owner's words without the owner's ad-libbed take", () => {
    for (const voice of ["ad-lib", "read", "mixed"] as const) {
      expect(wordingOf(bare("c"), voice)).toBe("agent")
      expect(wordingOf(shot("t", { take }), voice)).toBe(
        voice === "ad-lib" ? "you" : "agent"
      )
      expect(wordingOf(shot("r", { take, voice: "read" }), voice)).toBe("agent")
    }
  })

  it("never shows the owner's hands without the owner's own step", () => {
    const withoutOwner: ReadonlyArray<Step> = STEPS.filter(
      (s) => s.kind !== "owner"
    )
    for (const s of PATHS) {
      expect(handsOf(s, withoutOwner)).not.toContain("you")
      expect(handsOf(s).includes("you")).toBe(s.take !== undefined)
    }
  })

  it("moves a scene's hands when a step moves to another kind", () => {
    const moved = STEPS.map((s) =>
      s.id === "render" ? { ...s, kind: "claude" as const } : s
    )
    // Fitting the scene to its length stays code.
    expect(handsOf(bare("c"), moved)).toEqual(["agent", "code"])
  })

  it("times each scene at its exact frame", () => {
    const cut: CutList = cutList([bare("A"), shot("B"), bare("C")])
    const placement = place(
      cut.shots.map((s, i) => ({
        id: s.id,
        durationMs: s.durationMs,
        transitionIn: i === 0 ? ("cut" as const) : ("crossfade" as const),
      })),
      30
    )
    if (!placement.ok) throw new Error(placement.problems.join("; "))
    const params = authorshipParams(cut, placement.value, 30)
    const starts = placement.value.shots.map((s) => (s.startFrame * 1000) / 30)
    expect(params).toEqual({
      scenes: [
        {
          startMs: starts[0],
          origin: "agent",
          wording: "agent",
          hands: ["code"],
        },
        {
          startMs: starts[1],
          origin: "agent",
          wording: "agent",
          hands: ["code"],
        },
        {
          startMs: starts[2],
          origin: "agent",
          wording: "agent",
          hands: ["code"],
        },
      ],
      endMs: (placement.value.totalFrames * 1000) / 30,
    })
  })
})

describe("where the authorship mark can go", () => {
  const mark = { kind: "authorship", design: "cells-v1", params: {} }
  const problems = (cut: CutList): ReadonlyArray<string> => {
    const parsed = parseCutList(cut)
    return parsed.ok ? [] : parsed.problems
  }

  it("takes the whole video, between a bare card first and last", () => {
    expect(
      problems(cutList([bare("A"), shot("B"), bare("C")], { burnIns: [mark] }))
    ).toEqual([])
  })

  it("refuses what would let it claim more than the scenes say", () => {
    expect(
      problems(
        cutList(
          [
            shot("A", { burnIns: [mark] }),
            shot("B", {
              idea: { origin: "you", from: { kind: "note", id: "n9" } },
            }),
          ],
          {
            burnIns: [{ ...mark, params: { scenes: [] } }, mark],
          }
        )
      )
    ).toEqual([
      "A: the authorship mark covers the whole video",
      "B: its idea cites note n9, which the project doesn't have",
      "the authorship mark is drawn once",
      "the authorship mark is drawn from the scenes; nothing is written for it",
      "the authorship mark needs a scene between its intro and its end card",
    ])
    expect(
      problems(cutList([shot("A"), shot("B"), shot("C")], { burnIns: [mark] }))
    ).toEqual([
      "the authorship mark's intro needs a bare card as the first scene",
      "the authorship mark's end card needs a bare card as the last scene",
    ])
  })
})
