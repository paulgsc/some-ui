import {
  duckExpr,
  planAssembly,
  planBed,
  planMix,
  planSegment,
  readLoudness,
} from "@video-render/plan"
import type { Assembly, Facts, Mix, Scene } from "@video-render/plan"
import { resolve } from "@video-render/resolve"
import { place } from "@video-render/timing"
import { TRANSITIONS } from "@video-render/vocabulary"
import type { Background, MotionKind } from "@video-render/vocabulary"
import { describe, expect, it } from "vitest"

import { cutList, MOTIONS, series, shot, SUM } from "./fixtures"

const FACTS: Facts = new Map([
  ["captures/walk.mp4", { width: 824, height: 1830, durationMs: 60_000 }],
  ["captures/wide.mp4", { width: 1280, height: 720, durationMs: 60_000 }],
  ["captures/still.png", { width: 640, height: 480, durationMs: 0 }],
])

const PLACED = {
  id: "S1",
  cut: undefined,
  startFrame: 0,
  frames: 60,
  overlapFrames: 0,
}

function scene(over: Parameters<typeof shot>[1]): Scene {
  const r = resolve(cutList([shot("S1", over)], { look: "plain" }), series())
  const s = r.ok ? r.value.shots[0] : undefined
  if (!s) throw new Error("fixture")
  return { shot: s, placed: PLACED }
}

const graph = (s: Scene): string => {
  const args = planSegment(s, series(), FACTS, "out.mkv").args
  return args[args.indexOf("-filter_complex") + 1] ?? ""
}

/** What each motion leaves in a scene's filters. */
const DRAWN: ReadonlyArray<[MotionKind, string]> = [
  ["still", "crop=824:1230:0:'0'"],
  ["push-in", "(1+0.1*min(t/2,1))"],
  ["pull-out", "(1+0.1*(1-min(t/2,1)))"],
  ["pan", "if(lt(t,0),0,if(lt(t,0.8),"],
  ["punch-in", "max(1,1+0.2*min(max((t-0.3)/0.15,0),1)-0.2*"],
  ["freeze", "trim=duration=0.500000"],
]

const ZOOMS: ReadonlyArray<MotionKind> = ["push-in", "pull-out", "punch-in"]

describe("planSegment", () => {
  it.each(DRAWN)("draws %s", (kind, expected) => {
    const g = graph(scene({ overrides: { motion: MOTIONS[kind] } }))
    expect(g).toContain(expected)
    // Only a zoom scales per frame.
    expect(g.includes("eval=frame")).toBe(ZOOMS.includes(kind))
  })

  it("holds the first frame for a freeze at the start", () => {
    expect(
      graph(scene({ overrides: { motion: { kind: "freeze", atMs: 0 } } }))
    ).toContain("[0:v]trim=end_frame=1,setpts=PTS-STARTPTS,tpad=")
  })

  it("zooms about the window's centre", () => {
    const z = "(1+0.1*min(t/2,1))"
    expect(
      graph(scene({ overrides: { motion: MOTIONS["push-in"] } }))
    ).toContain(
      `crop=972:1450:x='(2*trunc(972*${z}/2)-972)/2':y='(2*trunc(1450*${z}/2)-1450)/2'`
    )
  })

  it("crops a source wider than the window at its sides, unstretched", () => {
    const g = graph(
      scene({
        picture: {
          kind: "capture",
          source: "captures/wide.mp4",
          inMs: 0,
          speed: 1,
          cssWidth: 1280,
          framing: { mode: "crop", zoom: 1, x: 0, y: 0 },
          taps: [],
        },
      })
    )
    // 482 by 720 is the window's shape (972 by 1450) at the source's height.
    expect(g).toContain("crop=482:720:0:'0'")
  })

  it.each<[Background, string]>([
    [{ kind: "as-captured" }, "color=c=#111821:s=1080x1920:r=30"],
    [{ kind: "blurred" }, "split=2[src][blur]"],
    [
      { kind: "image", image: { file: "kit/bg.png", sha256: SUM } },
      "force_original_aspect_ratio=increase",
    ],
  ])("puts %o behind the picture", (background, expected) => {
    const { args } = planSegment(
      scene({ overrides: { background } }),
      series(),
      FACTS,
      "out.mkv"
    )
    expect(args.join(" ")).toContain(expected)
  })

  it("fits a still inside the window and centres it", () => {
    expect(
      graph(scene({ picture: { kind: "still", source: "captures/still.png" } }))
    ).toContain(
      "scale=972:730:flags=lanczos,setsar=1[pic];[bg][pic]overlay=x=54:y=610"
    )
  })
})

describe("planAssembly", () => {
  function assembly(over: Partial<Assembly> = {}): Assembly {
    const shots = TRANSITIONS.map((t, i) =>
      shot(`S${i}`, i === 0 ? {} : { overrides: { transitionIn: t } })
    )
    const r = resolve(cutList(shots), series())
    if (!r.ok) throw new Error(r.problems.join("\n"))
    const p = place(
      r.value.shots.map((s) => ({
        id: s.shot.id,
        durationMs: 2000,
        transitionIn: s.transitionIn,
      })),
      30
    )
    if (!p.ok) throw new Error(p.problems.join("\n"))
    const scenes = r.value.shots.map((s, i) => {
      const placed = p.value.shots[i]
      if (!placed) throw new Error("fixture")
      return { shot: s, placed }
    })
    return {
      scenes,
      segments: scenes.map((s) => `${s.shot.shot.id}.mkv`),
      totalFrames: p.value.totalFrames,
      layers: [],
      mix: "mix.wav",
      ...over,
    }
  }
  const filters = (a: Assembly): string => {
    const args = planAssembly(a, series(), "video.mp4").args
    return args[args.indexOf("-filter_complex") + 1] ?? ""
  }

  it("joins every transition at its frame", () => {
    const a = assembly()
    const f = filters(a)
    expect(f).toContain(
      "[s0][s1]xfade=transition=fade:duration=0.400000:offset=1.600000[j1]"
    )
    expect(f).toContain(
      "xfade=transition=fadeblack:duration=0.500000:offset=3.100000"
    )
    expect(f).toContain(
      "xfade=transition=slideup:duration=0.366667:offset=4.733333"
    )
    expect(f).toContain("xfade=transition=wipeleft")
    expect(f).toContain("xfade=transition=zoomin")
    const cut = filters({
      ...a,
      scenes: a.scenes.map((s, i) =>
        i === 1 ? { ...s, shot: { ...s.shot, transitionIn: "cut" } } : s
      ),
    })
    expect(cut).toContain("[s0][s1]concat=n=2:v=1:a=0[j1]")
  })

  it("lays a burn-in from its frame on", () => {
    expect(
      filters(assembly({ layers: [{ file: "b.mov", startFrame: 45 }] }))
    ).toContain("setpts=PTS-STARTPTS+1.500000/TB[b0]")
  })
})

describe("the sound", () => {
  const take = { file: "voice/a.wav", inMs: 0, outMs: 1000, atMs: 2000 }

  it("lowers the bed while each take plays, with ramps either side", () => {
    // Full until 1.8 s, down by 1.6 s to 2 s ... 3 s, back up by 3.4 s.
    expect(duckExpr([take], -10)).toBe(
      "1-0.683772*min(clip((t-1.800)/0.2,0,1),clip((3.400-t)/0.4,0,1))"
    )
    expect(duckExpr([], -10)).toBe("1")
  })

  it.each(["under-voice", "up-between-lines"] as const)(
    "makes the bed for %s from one input",
    (music) => {
      const args = planBed(music, [take], 90, series(), "bed.wav")?.args ?? []
      expect(args.filter((a) => a === "-i")).toHaveLength(1)
      expect(args.join(" ")).toContain(
        music === "under-voice" ? "volume=-14dB" : "volume=-8dB"
      )
    }
  )

  it("has no bed when the series has no music", () => {
    expect(
      planBed("under-voice", [], 90, series({ music: undefined }), "bed.wav")
    ).toBeNull()
  })

  it("sums the parts, each cue at its time", () => {
    const mix = (over: Partial<Mix> = {}): string =>
      planMix(
        { totalFrames: 60, voice: null, bed: null, cues: [], ...over },
        series(),
        "mix.wav"
      ).args.join(" ")
    const f = mix({
      voice: "voice-level.wav",
      bed: "bed.wav",
      cues: [{ file: "kit/click.wav", atMs: 400 }],
    })
    expect(f).toContain("amix=inputs=3:normalize=0")
    expect(f).toContain("adelay=400:all=1,volume=-8dB[c0]")
    expect(mix()).toContain("anullsrc=r=48000:cl=mono")
  })
})

describe("readLoudness", () => {
  it("reads ffmpeg's measurement, and nothing else", () => {
    const stderr =
      'size=N/A\n[Parsed_loudnorm_0 @ 0x0] \n{\n\t"input_i" : "-23.10",\n\t"input_tp" : "-4.20",\n\t"input_lra" : "1.10",\n\t"input_thresh" : "-33.40",\n\t"target_offset" : "0.20"\n}\n'
    expect(readLoudness(stderr)?.input_i).toBe("-23.10")
    expect(readLoudness("no json here")).toBeNull()
  })
})
