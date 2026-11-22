/**
 * The one join of per-line takes (`layAudio`, `speaking.ts`): the cards
 * essays' and the walkthrough's, laid in one bit-exact ffmpeg call and
 * bounded by the laid file's own length.
 */
import type { FfmpegCall, SourceFacts } from "@video-render/plan"
import { BITEXACT } from "@video-render/plan"
import { Refused } from "@video-render/refused"
import type { Ports } from "@video-render/render"
import { layAudio } from "@video-render/speaking"
import { describe, expect, it } from "vitest"

function portsOf(
  laid: boolean,
  facts: SourceFacts | null
): { readonly ports: Ports; readonly calls: Array<FfmpegCall> } {
  const calls: Array<FfmpegCall> = []
  const ports: Ports = {
    ffmpeg: (call) => {
      calls.push(call)
      return Promise.resolve({ ok: laid, stderr: laid ? "" : "no" })
    },
    probe: () => Promise.resolve(facts),
    sha256: () => Promise.resolve(null),
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
  }
  return { ports, calls }
}

describe("layAudio", () => {
  it("pads each line as asked, joins them bit-exact, and answers the laid length", async () => {
    const { ports, calls } = portsOf(true, {
      width: 0,
      height: 0,
      durationMs: 4321.9,
    })
    const ms = await layAudio(
      ports,
      [
        { file: "a.wav", pad: { kind: "after", ms: 600 } },
        { file: "b.wav", pad: { kind: "until", ms: 2500 } },
        { file: "c.wav", pad: null },
      ],
      "out.wav"
    )
    expect(ms).toBe(4321)
    const args = calls[0]?.args ?? []
    expect(args.filter((a) => a.endsWith(".wav"))).toEqual([
      "a.wav",
      "b.wav",
      "c.wav",
      "out.wav",
    ])
    expect(args[args.indexOf("-filter_complex") + 1]).toBe(
      "[0:a]apad=pad_dur=0.6[p0];[1:a]apad=whole_dur=2.5[p1];[2:a]anull[p2];[p0][p1][p2]concat=n=3:v=0:a=1"
    )
    expect(args.join(" ")).toContain(BITEXACT.join(" "))
    expect(args.join(" ")).not.toContain("adelay")
  })

  it("refuses a join ffmpeg can't lay or ffprobe can't read", async () => {
    const lines = [{ file: "a.wav", pad: null }] as const
    await expect(
      layAudio(portsOf(false, null).ports, lines, "out.wav")
    ).rejects.toBeInstanceOf(Refused)
    await expect(
      layAudio(portsOf(true, null).ports, lines, "out.wav")
    ).rejects.toBeInstanceOf(Refused)
  })
})
