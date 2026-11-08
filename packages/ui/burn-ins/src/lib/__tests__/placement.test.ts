/** @vitest-environment node */
import {
  boxesOf,
  DESIGNS,
  frameAt,
  KINDS,
  prepare,
  REGIONS_OF,
  runtimeMs,
  type Kind,
  type Prepared,
} from "@burn-ins/lib/burn-in"
import {
  frameName,
  frameProblem,
  FRAMES,
  geometryOf,
  inside,
  LANDSCAPE,
  overlaps,
  PORTRAIT,
  type FrameSize,
  type Region,
} from "@burn-ins/lib/geometry"
import { samplesOf, STILL_SAMPLE_MS } from "@burn-ins/lib/samples"
import { describe, expect, it } from "vitest"

const ready = (
  kind: Kind,
  design: string,
  params: unknown,
  frame: FrameSize
): Prepared => {
  const p = prepare({ kind, design, params }, frame)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

/** Every 50 ms of a sample. */
const times = (p: Prepared): ReadonlyArray<number> => {
  const total = runtimeMs(p) ?? STILL_SAMPLE_MS
  return Array.from({ length: Math.ceil(total / 50) + 1 }, (_, i) => i * 50)
}

/** Every sample of every kind, in every design, as prepared for `frame`. */
const every = (
  frame: FrameSize
): ReadonlyArray<{
  kind: Kind
  design: string
  sample: number
  p: ReturnType<typeof prepare>
}> =>
  KINDS.flatMap((kind) =>
    DESIGNS[kind].flatMap((design) =>
      samplesOf(kind).map((params, sample) => ({
        kind,
        design,
        sample,
        p: prepare({ kind, design, params }, frame),
      }))
    )
  )

const shared = (a: Kind, b: Kind): ReadonlyArray<Region> =>
  REGIONS_OF[a].filter((r: Region) => REGIONS_OF[b].some((s) => s === r))

describe("the frames burn-ins are drawn for", () => {
  it("are the 9:16 short and the 16:9 video", () => {
    expect(FRAMES.map(frameName)).toEqual(["1080x1920", "1920x1080"])
  })

  it("keep the short's geometry exactly as every short so far drew it", () => {
    expect(geometryOf(PORTRAIT)).toEqual({
      frame: { width: 1080, height: 1920 },
      safeArea: { x: 65, y: 154, width: 853, height: 1382 },
      regions: {
        header: { x: 54, y: 40, width: 972, height: 210 },
        body: { x: 54, y: 250, width: 972, height: 1000 },
        "lower-third": { x: 65, y: 1250, width: 853, height: 286 },
        gutter: { x: 6, y: 250, width: 42, height: 1000 },
      },
      typeScale: 1,
    })
  })

  it("keep the 16:9 video's controls clear: 8% at the top, 12% at the foot, 5% each side", () => {
    expect(geometryOf(LANDSCAPE)).toEqual({
      frame: { width: 1920, height: 1080 },
      safeArea: { x: 96, y: 86, width: 1728, height: 864 },
      regions: {
        header: { x: 96, y: 40, width: 1728, height: 210 },
        body: { x: 96, y: 250, width: 1728, height: 450 },
        "lower-third": { x: 96, y: 700, width: 1728, height: 250 },
        gutter: { x: 48, y: 250, width: 42, height: 450 },
      },
      typeScale: 1,
    })
  })

  it.each([
    { width: 1280, height: 720 },
    { width: 1920, height: 1920 },
  ])("refuse any other frame, naming it ($width x $height)", (frame) => {
    const why = `burn-ins are drawn for 1080x1920 or 1920x1080, not ${frameName(frame)}`
    expect(frameProblem(frame)).toBe(why)
    expect(() => geometryOf(frame)).toThrow(why)
  })
})

describe("the regions each kind draws in", () => {
  it("shares a region only between a scene's headline and its card, one or the other, the authorship mark's bare cards, and a game card in the body", () => {
    const sharing = KINDS.flatMap((a, i) =>
      KINDS.slice(i + 1).flatMap((b) =>
        shared(a, b).length > 0 ? [[a, b]] : []
      )
    )
    expect(sharing).toEqual([
      ["headline", "card"],
      ["headline", "authorship"],
      ["card", "authorship"],
      ["card", "game-card"],
      ["authorship", "game-card"],
    ])
  })
})

describe.each(FRAMES.map((frame) => ({ frame, name: frameName(frame) })))(
  "where burn-ins sit in $name",
  ({ frame }) => {
    const g = geometryOf(frame)

    it("never puts two regions over each other, or a region off the frame", () => {
      const regions = Object.entries(g.regions)
      const whole = { x: 0, y: 0, ...g.frame }
      for (const [i, [a, boxA]] of regions.entries()) {
        expect(inside(boxA, whole), a).toBe(true)
        for (const [b, boxB] of regions.slice(i + 1)) {
          expect(overlaps(boxA, boxB), `${a} and ${b}`).toBe(false)
        }
      }
    })

    it("keeps the lower third, where captions sit, inside the safe area", () => {
      expect(inside(g.regions["lower-third"], g.safeArea)).toBe(true)
    })

    it("keeps every kind inside its regions at every moment of its sample", () => {
      for (const { kind, design, p } of every(frame)) {
        if (!p.ok) continue
        const regions = REGIONS_OF[kind].map((r: Region) => g.regions[r])
        for (const t of times(p.value)) {
          for (const box of boxesOf(frameAt(p.value, t))) {
            expect(
              regions.some((r) => inside(box, r)),
              `${kind} (${design}) at ${t} ms: ${JSON.stringify(box)}`
            ).toBe(true)
          }
        }
      }
    })

    it("keeps the authorship mark to the gutter between its intro and its end card", () => {
      const p = ready(
        "authorship",
        "cells-v1",
        samplesOf("authorship")[0],
        frame
      )
      for (const t of times(p)) {
        const f = frameAt(p, t)
        if (f.kind !== "authorship" || f.frame.part !== "mark") continue
        for (const box of boxesOf(f)) {
          expect(inside(box, g.regions.gutter), `${t} ms`).toBe(true)
        }
      }
    })
  }
)

describe("what doesn't fit", () => {
  it("is nothing in the short: every sample draws", () => {
    expect(every(PORTRAIT).filter(({ p }) => !p.ok)).toEqual([])
  })

  it("is, in the 16:9 video's shorter body, the card with a note and the chain and path game cards, each refused with the reason", () => {
    expect(
      every(LANDSCAPE).flatMap(({ kind, sample, p }) =>
        p.ok ? [] : [[kind, sample, p.problems]]
      )
    ).toEqual([
      ["card", 0, ["the card burn-in (v1): the note doesn't fit"]],
      [
        "game-card",
        3,
        ["the game-card burn-in (gridiron-v1): the chain doesn't fit"],
      ],
      [
        "game-card",
        4,
        ["the game-card burn-in (gridiron-v1): the path doesn't fit"],
      ],
    ])
  })
})
