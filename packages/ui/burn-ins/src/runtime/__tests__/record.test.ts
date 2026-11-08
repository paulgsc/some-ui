/** @vitest-environment node */
import { SAMPLE } from "@burn-ins/lib/captions/sample"
import { FRAMES, PORTRAIT } from "@burn-ins/lib/geometry"
import { CardParamsSchema } from "@burn-ins/lib/journal"
import { SAMPLES } from "@burn-ins/lib/samples"
import { createRecorder, type RecordPorts } from "@burn-ins/runtime/record"
import { describe, expect, it } from "vitest"

const ports: RecordPorts = {
  fontsReady: () => Promise.resolve(),
  afterPaint: () => Promise.resolve(),
}

/** A recorder whose component draws whatever it is shown, at once. */
const drawing = (): ReturnType<typeof createRecorder> => {
  const r = createRecorder(ports)
  r.subscribe(() => r.drew(r.getSnapshot().seq))
  return r
}

describe("the recording protocol", () => {
  it("says why a burn-in can't be loaded", () => {
    const r = drawing()
    expect(r.load({ kind: "card", design: "v9", params: {} }).ok).toBe(false)
  })

  it("waits for the moment to be drawn before answering", async () => {
    const r = createRecorder(ports)
    expect(
      r.load({ kind: "headline", design: "v1", params: SAMPLES.headline })
    ).toEqual({ ok: true, value: { runtimeMs: null } })
    let answered = false
    const seek = r.seek(0).then(() => {
      answered = true
    })
    await Promise.resolve()
    expect(answered).toBe(false)
    expect(r.getSnapshot().frame?.kind).toBe("headline")
    r.drew(r.getSnapshot().seq)
    await seek
    expect(answered).toBe(true)
  })

  it("gives equal keys for equal pictures, and shows nothing new for them", async () => {
    const r = drawing()
    r.load({ kind: "captions", design: "gridiron", params: SAMPLES.captions })
    const a = await r.seek(0)
    const seq = r.getSnapshot().seq
    expect(await r.seek(10)).toBe(a)
    expect(r.getSnapshot().seq).toBe(seq)
    expect(await r.seek(1500)).not.toBe(a)
  })

  it("draws in the short when it is given no frame", () => {
    const r = drawing()
    r.load({ kind: "headline", design: "v1", params: SAMPLES.headline })
    expect(r.getSnapshot().geometry.frame).toEqual(PORTRAIT)
  })

  it.each(
    FRAMES.map((frame) => ({ frame, name: `${frame.width}x${frame.height}` }))
  )(
    "draws on a stage the size of the video's frame ($name)",
    async ({ frame }) => {
      const r = drawing()
      expect(
        r.load({
          kind: "captions",
          design: "gridiron",
          params: SAMPLES.captions,
          frame,
        })
      ).toEqual({ ok: true, value: { runtimeMs: expect.any(Number) } })
      expect(r.getSnapshot().geometry.frame).toEqual(frame)
      await r.seek(SAMPLE[0]?.words[0]?.startMs ?? 0)
      const shown = r.getSnapshot().frame
      if (shown?.kind !== "captions" || shown.frame.caption === null)
        throw new Error("no caption up")
      const { box } = shown.frame.layout
      expect(box.x + box.width).toBeLessThanOrEqual(frame.width)
      expect(box.y + box.height).toBeLessThanOrEqual(frame.height)
    }
  )

  it("refuses a frame burn-ins aren't drawn for, naming it", () => {
    const r = drawing()
    expect(
      r.load({
        kind: "headline",
        design: "v1",
        params: SAMPLES.headline,
        frame: { width: 1280, height: 720 },
      })
    ).toEqual({
      ok: false,
      problems: [
        "the headline burn-in (v1): burn-ins are drawn for 1080x1920 or 1920x1080, not 1280x720",
      ],
    })
  })

  it("checks a video's burn-ins in its frame", () => {
    const r = drawing()
    const at = { startFrame: 0, frames: 30 }
    const both = [
      { kind: "headline", design: "v1", params: SAMPLES.headline, ...at },
      {
        kind: "card",
        design: "v1",
        params: { ...CardParamsSchema.parse(SAMPLES.card), note: "" },
        ...at,
      },
    ]
    for (const frame of FRAMES) {
      expect(r.check({ burnIns: both, fps: 30, frame }).join()).toMatch(
        /both draw in the header/
      )
    }
    expect(r.check({ burnIns: both, fps: 30 }).join()).toMatch(
      /both draw in the header/
    )
  })
})
