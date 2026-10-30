import { parseCutList } from "@video-render/cut-list"
import { fromTimelineV1, V1_PROVENANCE } from "@video-render/timeline-v1"
import { describe, expect, it } from "vitest"

/** The shape of the TOPIK short's timeline, shortened. */
const TIMELINE = {
  project: "TOPIK Study on my phone",
  takes: "voice/takes.json",
  shots: [
    {
      id: "S01",
      cut: "hook",
      duration: 10,
      kind: "capture",
      provenance: "browser",
      kicker: "TOPIK STUDY",
      headline: "I answered her in casual Korean",
      label: "3x speed",
      source: "captures/topik/topik.mp4",
      in: { mark: "tap the casual reply", at: -5.45 },
      out: { mark: "tap the casual reply", at: 4.55 },
      view: {
        mode: "crop",
        keys: [
          [0, 0],
          [{ mark: "tap the casual reply", at: 0.5 }, 240],
        ],
      },
      take_in: 0.3,
      take_out: 6.1,
    },
    {
      id: "S02",
      cut: "why",
      duration: 12,
      kind: "card",
      kicker: "WHY",
      headline: "A drama I can only follow in Korean",
      body: "A short scene in Korean.",
      note: "Korean listening.",
    },
  ],
}

const MARKS = new Map([
  [
    "captures/topik/topik.mp4",
    new Map([
      ["tap the casual reply", 20],
      ["open a scene", 3],
    ]),
  ],
])

describe("fromTimelineV1", () => {
  it("reads a v1 short as a cut list that renders as it did", () => {
    const converted = fromTimelineV1(TIMELINE, {
      marks: MARKS,
      takes: new Map([
        ["hook", { file: "voice/01-hook.webm", lengthMs: 7000 }],
      ]),
      series: { id: "build-journal-short", version: 1 },
    })
    if (!converted.ok) throw new Error(converted.problems.join("\n"))
    const cut = converted.value
    expect(parseCutList(cut).ok).toBe(true)
    expect([cut.look, cut.voice]).toEqual(["plain", "read"])

    const [hook, why] = cut.shots
    expect(hook?.picture).toEqual({
      kind: "capture",
      source: "captures/topik/topik.mp4",
      inMs: 14550,
      outMs: 24550,
      speed: 1,
      cssWidth: 412,
      framing: { mode: "crop", zoom: 1, x: 0, y: 0 },
      taps: [5450],
    })
    expect(hook?.overrides.motion).toEqual({
      kind: "pan",
      keys: [
        [0, 0],
        [5950, 240],
      ],
    })
    // Fitted to its take: a breath before, the take, half a second after.
    expect(hook?.take).toEqual({
      file: "voice/01-hook.webm",
      inMs: 300,
      outMs: 6100,
    })
    expect(hook?.durationMs).toBe(6500)
    expect(hook?.burnIns).toEqual([
      {
        kind: "headline",
        design: "v1",
        params: {
          kicker: "TOPIK STUDY",
          headline: "I answered her in casual Korean",
          line: `${V1_PROVENANCE.browser}  ·  3x speed`,
        },
      },
    ])
    expect(why?.picture).toEqual({ kind: "card" })
    expect(why?.durationMs).toBe(12000)
    expect(why?.burnIns[0]?.params).toMatchObject({
      body: "A short scene in Korean.",
    })
  })

  it("keeps a fitted scene's pan and taps inside it", () => {
    const converted = fromTimelineV1(
      {
        project: "Short",
        shots: [
          {
            id: "S1",
            cut: "c",
            duration: 10,
            kind: "capture",
            source: "walk.mp4",
            in: 0,
            out: 10,
            view: {
              mode: "crop",
              keys: [
                [0, 0],
                [8, 300],
              ],
            },
          },
        ],
      },
      {
        marks: new Map([["walk.mp4", new Map([["tap late", 9]])]]),
        takes: new Map([["c", { file: "c.webm", lengthMs: 1000 }]]),
        series: { id: "build-journal-short", version: 1 },
      }
    )
    if (!converted.ok) throw new Error(converted.problems.join("\n"))
    const [s] = converted.value.shots
    expect(s?.durationMs).toBe(1700)
    // Where the eased pan was at 1.7 s of its 8 s run.
    expect(s?.overrides.motion).toEqual({
      kind: "pan",
      keys: [
        [0, 0],
        [1700, 32],
      ],
    })
    expect(s?.picture.kind === "capture" && s.picture.taps).toEqual([])
  })

  it("names a mark the recorder never wrote", () => {
    const converted = fromTimelineV1(TIMELINE, {
      marks: new Map(),
      takes: new Map(),
      series: { id: "build-journal-short", version: 1 },
    })
    expect(converted.ok ? [] : [...new Set(converted.problems)]).toEqual([
      'S01: no mark "tap the casual reply" beside captures/topik/topik.mp4',
    ])
  })
})
