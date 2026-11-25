/** @vitest-environment node */
/**
 * The host as a burn-in kind (HOST1, #3522): its params checked against the
 * cast's closed unions, drawn over the safe area wherever its beats place it,
 * and laid over another burn-in without a clash (C1485).
 */
import { boxesOf, frameAt, prepare, type Prepared } from "@burn-ins/lib/burn-in"
import { clashes } from "@burn-ins/lib/clash"
import {
  frameName,
  FRAMES,
  geometryOf,
  inside,
  LANDSCAPE,
  overlaps,
  type FrameSize,
} from "@burn-ins/lib/geometry"
import { hostBox } from "@burn-ins/lib/host"
import { SAMPLES, STILL_SAMPLE_MS } from "@burn-ins/lib/samples"
import {
  CEREMONIES,
  EMOTIONS,
  HOST_CHARACTERS,
  PLACEMENTS,
  SHOTS,
} from "@some-ui/styles/brand/host"
import { describe, expect, it } from "vitest"

const beat = {
  atMs: 0,
  character: "tin-owlet",
  emotion: "neutral",
  shot: "long",
  placement: "bottom-right",
  speaking: false,
} as const

const ready = (params: unknown, frame: FrameSize = LANDSCAPE): Prepared => {
  const p = prepare({ kind: "host", design: "cast-v1", params }, frame)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

const problems = (params: unknown): ReadonlyArray<string> => {
  const p = prepare({ kind: "host", design: "cast-v1", params }, LANDSCAPE)
  return p.ok ? [] : p.problems
}

const boxAt = (p: Prepared, t: number): ReturnType<typeof hostBox> => {
  const f = frameAt(p, t)
  if (f.kind !== "host") throw new Error(f.kind)
  return hostBox(f.frame)
}

describe("the host's params", () => {
  it.each(HOST_CHARACTERS)(
    "take every emotion and ceremony of %s, the schema held to the cast's lists",
    (character) => {
      for (const emotion of EMOTIONS[character]) {
        expect(
          problems({ seed: 1, beats: [{ ...beat, character, emotion }] }),
          emotion
        ).toEqual([])
      }
      const ceremonies: ReadonlyArray<string> = CEREMONIES[character]
      for (const animation of ceremonies) {
        expect(
          problems({
            seed: 1,
            beats: [{ ...beat, character, emotion: "happy", animation }],
          }),
          animation
        ).toEqual([])
      }
    }
  )

  it("take the sample: Mochi asks, Tin Bird answers", () => {
    expect(problems(SAMPLES.host)).toEqual([])
  })

  it("refuse an emotion that isn't the character's, a ceremony Tin Bird hasn't, and beats out of order", () => {
    expect(
      problems({ seed: 1, beats: [{ ...beat, emotion: "hesitation" }] })
    ).toHaveLength(1)
    expect(
      problems({
        seed: 1,
        beats: [{ ...beat, character: "mochi", emotion: "hesitation" }],
      })
    ).toEqual([])
    expect(
      problems({
        seed: 1,
        beats: [
          {
            ...beat,
            character: "mochi",
            emotion: "happy",
            animation: "nfl-celebration",
          },
        ],
      })
    ).toEqual([])
    expect(
      problems({
        seed: 1,
        beats: [
          {
            ...beat,
            character: "mochi",
            emotion: "happy",
            animation: "touchdown-dance",
          },
        ],
      })
    ).toHaveLength(1)
    expect(
      problems({
        seed: 1,
        beats: [{ ...beat, animation: "nfl-celebration" }],
      })
    ).toHaveLength(1)
    expect(
      problems({ seed: 1, beats: [{ ...beat, character: "tin-sparrow" }] })
    ).toHaveLength(1)
    expect(problems({ seed: 1, beats: [{ ...beat, atMs: 10 }, beat] })).toEqual(
      ["the host burn-in (cast-v1): beats: the beats start in order"]
    )
    expect(problems({ seed: 1, beats: [] })).toHaveLength(1)
  })
})

describe.each(FRAMES.map((frame) => ({ frame, name: frameName(frame) })))(
  "the host in $name",
  ({ frame }) => {
    const g = geometryOf(frame)

    it("stays inside the safe area at every shot and placement", () => {
      for (const shot of SHOTS) {
        for (const placement of PLACEMENTS) {
          const p = ready(
            { seed: 3, beats: [{ ...beat, shot, placement }] },
            frame
          )
          for (const box of boxAt(p, 0)) {
            expect(inside(box, g.safeArea), `${shot} ${placement}`).toBe(true)
          }
        }
      }
    })

    it("claims no region, so it covers a card without a clash (C1485)", () => {
      const p = ready(SAMPLES.host, frame)
      for (let t = 0; t <= STILL_SAMPLE_MS; t += 250) {
        expect(boxesOf(frameAt(p, t))).toEqual([])
      }
      const close = ready(
        {
          seed: 3,
          beats: [{ ...beat, shot: "close-up", placement: "center" }],
        },
        frame
      )
      expect(boxAt(close, 0).some((box) => overlaps(box, g.regions.body))).toBe(
        true
      )
      expect(
        clashes(
          [
            {
              kind: "rule",
              design: "rule-v1",
              params: SAMPLES.rule,
              startFrame: 0,
              frames: 60,
            },
            {
              kind: "host",
              design: "cast-v1",
              params: SAMPLES.host,
              startFrame: 0,
              frames: 60,
            },
          ],
          30,
          frame
        )
      ).toEqual([])
    })

    it("draws the same frame for the same moment", () => {
      const p = ready(SAMPLES.host, frame)
      for (let t = 0; t <= STILL_SAMPLE_MS; t += 333) {
        expect(frameAt(p, t)).toEqual(frameAt(ready(SAMPLES.host, frame), t))
      }
    })
  }
)
