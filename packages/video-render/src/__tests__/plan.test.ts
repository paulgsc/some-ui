import {
  panExpr,
  planAssembly,
  planSegment,
  readLoudness,
  zoomExpr,
} from "@video-render/plan"
import type { Assembly, Facts } from "@video-render/plan"
import { resolve } from "@video-render/resolve"
import type { ResolvedShot } from "@video-render/resolve"
import { place } from "@video-render/timing"
import type { Placed } from "@video-render/timing"
import { MUSIC_MODES, TRANSITIONS } from "@video-render/vocabulary"
import type { Background, Motion } from "@video-render/vocabulary"
import { describe, expect, it } from "vitest"

import { cutList, series, shot, SUM } from "./fixtures"

const FACTS: Facts = new Map([
  ["captures/walk.mp4", { width: 824, height: 1830, durationMs: 60_000 }],
  ["captures/still.png", { width: 640, height: 480, durationMs: 0 }],
])

const PLACED: Placed = {
  id: "S1",
  cut: undefined,
  startFrame: 0,
  frames: 60,
  overlapFrames: 0,
}

function resolved(over: Parameters<typeof shot>[1]): ResolvedShot {
  const r = resolve(cutList([shot("S1", over)], { look: "plain" }), series())
  if (!r.ok || !r.shots[0]) throw new Error("fixture")
  return r.shots[0]
}

const graph = (s: ResolvedShot): string => {
  const args = planSegment(s, PLACED, series(), FACTS, "out.mkv").args
  return args[args.indexOf("-filter_complex") + 1] ?? ""
}

/** What each motion leaves in a scene's filters. */
const MOTIONS: Readonly<Record<Motion["kind"], [Motion, string]>> = {
  still: [{ kind: "still" }, "crop=824:1230:0:'0'"],
  "push-in": [{ kind: "push-in", amount: 0.1 }, "(1+0.1*min(t/2,1))"],
  "pull-out": [{ kind: "pull-out", amount: 0.1 }, "(1+0.1*(1-min(t/2,1)))"],
  pan: [
    {
      kind: "pan",
      keys: [
        [0, 0],
        [1000, 200],
      ],
    },
    "if(lt(t,0),0,if(lt(t,1),",
  ],
  "punch-in": [
    { kind: "punch-in", at: [500, 1500], amount: 0.2 },
    "(1+0.2*min(max((t-0.5)/0.15,0),1)-0.2*",
  ],
  freeze: [{ kind: "freeze", atMs: 700 }, "trim=duration=0.700000"],
}

describe("planSegment", () => {
  it.each(Object.entries(MOTIONS))("draws %s", (_kind, [motion, expected]) => {
    expect(graph(resolved({ overrides: { motion } }))).toContain(expected)
  })

  it.each<[Background, string]>([
    [{ kind: "as-captured" }, "color=c=#111821:s=1080x1920:r=30"],
    [{ kind: "blurred" }, "split=2[src][blur]"],
    [
      { kind: "image", image: { file: "kit/bg.png", sha256: SUM } },
      "force_original_aspect_ratio=increase",
    ],
  ])("puts %o behind the picture", (background, expected) => {
    const s = resolved({ overrides: { background } })
    const args = planSegment(s, PLACED, series(), FACTS, "out.mkv").args.join(
      " "
    )
    expect(args).toContain(expected)
  })

  it("fits a still inside the window and centres it", () => {
    expect(
      graph(
        resolved({ picture: { kind: "still", source: "captures/still.png" } })
      )
    ).toContain(
      "scale=972:730:flags=lanczos,setsar=1[pic];[bg][pic]overlay=x=54:y=610"
    )
  })

  it("writes exactly the frames it was placed for", () => {
    const args = planSegment(
      resolved({}),
      PLACED,
      series(),
      FACTS,
      "out.mkv"
    ).args
    expect(args[args.indexOf("-frames:v") + 1]).toBe("60")
    expect(args).toContain("+bitexact")
  })
})

describe("planAssembly", () => {
  function assembly(over: Partial<Assembly> = {}): Assembly {
    const shots = TRANSITIONS.map((t, i) =>
      shot(`S${i}`, { overrides: { transitionIn: t } })
    )
    const r = resolve(cutList(shots), series())
    if (!r.ok) throw new Error(r.problems.join("\n"))
    const p = place(
      r.shots.map((s) => ({
        id: s.shot.id,
        durationMs: 2000,
        transitionIn: s.transitionIn,
      })),
      30
    )
    if (!p.ok) throw new Error(p.problems.join("\n"))
    return {
      shots: r.shots,
      placed: p.shots,
      segments: r.shots.map((s) => `${s.shot.id}.mkv`),
      totalFrames: p.totalFrames,
      layers: [],
      voice: null,
      music: "off",
      cues: [],
      ...over,
    }
  }
  const filters = (a: Assembly): string => {
    const args = planAssembly(a, series(), "video.mp4").args
    return args[args.indexOf("-filter_complex") + 1] ?? ""
  }

  it("joins every transition at its frame", () => {
    const f = filters(assembly())
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
    // The first scene's "cut" comes in from nothing; a cut later is a join.
    const cut = filters(
      assembly({
        shots: assembly().shots.map((s, i) =>
          i === 1 ? { ...s, transitionIn: "cut" } : s
        ),
      })
    )
    expect(cut).toContain("[s0][s1]concat=n=2:v=1:a=0[j1]")
  })

  it.each(MUSIC_MODES)("mixes the music bed %s", (music) => {
    const f = filters(
      assembly({
        music,
        voice: { file: "voice.wav", loudness: null },
        cues: [{ file: "kit/click.wav", atMs: 400 }],
      })
    )
    expect(f.includes("sidechaincompress")).toBe(music !== "off")
    expect(f).toContain("adelay=400:all=1,volume=-8dB[c0]")
  })

  it("lays a burn-in from its frame on", () => {
    expect(
      filters(assembly({ layers: [{ file: "b.mov", startFrame: 45 }] }))
    ).toContain("setpts=PTS-STARTPTS+1.500000/TB[b0]")
  })

  it("gives a silent video a silent track", () => {
    expect(
      planAssembly(assembly(), series(), "video.mp4").args.join(" ")
    ).toContain("anullsrc=r=48000:cl=mono")
  })
})

describe("expressions", () => {
  it("holds a pan before its first key and after its last", () => {
    expect(panExpr([[500, 100]], (y) => y * 2)).toBe("if(lt(t,0.5),200,200)")
  })

  it("has no zoom for a motion that doesn't zoom", () => {
    expect(zoomExpr({ kind: "freeze", atMs: 10 }, 1000)).toBeNull()
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
