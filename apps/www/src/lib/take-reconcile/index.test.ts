/**
 * @vitest-environment node
 *
 * Home, as Takes › Needs your attention reads it (HEARD3): each answer of
 * `GET /voice-notes/attention` and of an act said in the page's terms, a
 * verdict as HEARD1 serves it, and Delete… only on a kind home deletes.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { deletesKind, readAct, readAttention } from "@/lib/take-reconcile/model"

const reply = (status: number, body: unknown = ""): HomeAnswer => ({
  status,
  body: typeof body === "string" ? body : JSON.stringify(body),
})

const SIGNALS = {
  avgLogprob: -1.2,
  compressionRatio: 1.4,
  noSpeechProb: 0.1,
  unsureShare: 0.6,
  language: "pt",
  languageP: 0.6,
  expectedLanguage: "en",
  wordsPerSecond: 0.4,
  speechMs: 12_000,
  peakDbfs: -18,
  rmsDbfs: -40,
}

const PAGE = {
  takes: [
    {
      id: "t1",
      of: "rust-round",
      ref: "w46:QM-311",
      recordedAt: "2026-11-10T09:00:00.000Z",
      heard: {
        text: "the bar oh checker",
        language: "pt",
        model: "ggml-small-q5_1.bin",
        heardAt: "2026-11-10T09:02:00.000Z",
      },
      verdict: {
        kind: "garbled",
        reasons: ["low_confidence", "off_language"],
        rule: "heard-1",
        signals: SIGNALS,
      },
    },
    {
      id: "t2",
      of: "studio",
      ref: "ep04:s3:2",
      recordedAt: "2026-11-11T09:00:00.000Z",
      heard: null,
      verdict: {
        kind: "failed",
        reasons: ["deadline"],
        rule: "heard-1",
        signals: null,
      },
    },
  ],
  total: 2,
}

describe("Takes › Needs your attention's reads of home (HEARD3)", () => {
  it("reads every take waiting, with its verdict and the languages heard", () => {
    const read = readAttention(reply(200, PAGE))
    expect(read.kind).toBe("read")
    const takes = read.kind === "read" ? read.page.takes : []
    expect(takes[0]).toMatchObject({
      id: "t1",
      of: "rust-round",
      heard: "the bar oh checker",
      verdict: {
        kind: "garbled",
        reasons: ["low_confidence", "off_language"],
        language: { heard: "pt", expected: "en" },
      },
    })
    expect(takes[1]).toMatchObject({
      heard: null,
      verdict: { kind: "failed", reasons: ["deadline"], language: null },
    })
  })

  it("reads blank words as none, and signals it can't read as none sent", () => {
    const read = readAttention(
      reply(200, {
        ...PAGE,
        takes: [
          {
            ...PAGE.takes[0],
            heard: { text: "  " },
            verdict: { ...PAGE.takes[0].verdict, signals: { language: 3 } },
          },
        ],
      })
    )
    const take = read.kind === "read" ? read.page.takes[0] : undefined
    expect(take?.heard).toBeNull()
    expect(take?.verdict.language).toBeNull()
  })

  it("says a home without the read judges nothing yet, and an answer it can't read", () => {
    expect(readAttention(reply(404))).toEqual({ kind: "older" })
    expect(readAttention(reply(500))).toEqual({ kind: "unreadable" })
    expect(readAttention(reply(200, "{"))).toEqual({ kind: "unreadable" })
    const guess = {
      ...PAGE,
      takes: [
        {
          ...PAGE.takes[0],
          verdict: { ...PAGE.takes[0].verdict, kind: "maybe" },
        },
      ],
    }
    expect(readAttention(reply(200, guess))).toEqual({ kind: "unreadable" })
  })

  it("counts an act kept only when home kept it", () => {
    expect(readAct(reply(200))).toBe("kept")
    expect(readAct(reply(201))).toBe("kept")
    for (const status of [404, 409, 422, 500]) {
      expect(readAct(reply(status))).toBe("notTaken")
    }
  })

  it("offers Delete… only on a kind home deletes (C443)", () => {
    expect(deletesKind("studio")).toBe(true)
    for (const of of ["rust-round", "interview", "reflection", "newer"]) {
      expect(deletesKind(of)).toBe(false)
    }
  })
})
