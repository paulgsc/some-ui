/** @vitest-environment node */
import { frameName, FRAMES, PORTRAIT } from "@burn-ins/lib/geometry"
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

  it.each(FRAMES.map((frame) => ({ frame, name: frameName(frame) })))(
    "draws on a stage the size of the video's frame ($name)",
    ({ frame }) => {
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
    }
  )

  it("checks a video's burn-ins in the short when it is given no frame", () => {
    const r = drawing()
    const at = { startFrame: 0, frames: 30 }
    const both = [
      { kind: "headline", design: "v1", params: SAMPLES.headline, ...at },
      { kind: "card", design: "v1", params: SAMPLES.card, ...at },
    ]
    expect(r.check({ burnIns: both, fps: 30 }).join()).toMatch(
      /both draw in the header/
    )
  })
})
