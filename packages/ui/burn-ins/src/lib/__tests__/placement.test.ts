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
import { inside, overlaps, REGIONS, type Region } from "@burn-ins/lib/geometry"
import { SAMPLES, STILL_SAMPLE_MS } from "@burn-ins/lib/samples"
import { describe, expect, it } from "vitest"

const ready = (kind: Kind, design: string): Prepared => {
  const p = prepare({ kind, design, params: SAMPLES[kind] })
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

/** Every 50 ms of a sample. */
const times = (p: Prepared): ReadonlyArray<number> => {
  const total = runtimeMs(p) ?? STILL_SAMPLE_MS
  return Array.from({ length: Math.ceil(total / 50) + 1 }, (_, i) => i * 50)
}

const every = (): ReadonlyArray<{ kind: Kind; design: string; p: Prepared }> =>
  KINDS.flatMap((kind) =>
    DESIGNS[kind].map((design) => ({ kind, design, p: ready(kind, design) }))
  )

const shared = (a: Kind, b: Kind): ReadonlyArray<Region> =>
  REGIONS_OF[a].filter((r: Region) => REGIONS_OF[b].some((s) => s === r))

describe("where burn-ins sit", () => {
  it("never puts two regions over each other", () => {
    const regions = Object.entries(REGIONS)
    for (const [i, [a, boxA]] of regions.entries()) {
      for (const [b, boxB] of regions.slice(i + 1)) {
        expect(overlaps(boxA, boxB), `${a} and ${b}`).toBe(false)
      }
    }
  })

  it("keeps every kind inside its regions at every moment of its sample", () => {
    for (const { kind, design, p } of every()) {
      const regions = REGIONS_OF[kind].map((r: Region) => REGIONS[r])
      for (const t of times(p)) {
        for (const box of boxesOf(frameAt(p, t))) {
          expect(
            regions.some((r) => inside(box, r)),
            `${kind} (${design}) at ${t} ms: ${JSON.stringify(box)}`
          ).toBe(true)
        }
      }
    }
  })

  it("shares a region only between a scene's headline and its card, one or the other", () => {
    const sharing = KINDS.flatMap((a, i) =>
      KINDS.slice(i + 1).flatMap((b) =>
        shared(a, b).length > 0 ? [[a, b]] : []
      )
    )
    expect(sharing).toEqual([["headline", "card"]])
  })
})
