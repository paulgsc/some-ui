/** @vitest-environment node */
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
})
