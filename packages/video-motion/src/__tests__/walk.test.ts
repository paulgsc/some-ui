import { readFileSync } from "node:fs"
import { jobs } from "@video-motion/walk/jobs"
import {
  clipOf,
  microphoneScript,
  murmurWav,
} from "@video-motion/walk/microphone"
import type { Step } from "@video-motion/walk/run"
import { stepProblems } from "@video-motion/walk/run"
import {
  screenPlace,
  versionOf,
  webviewBounds,
} from "@video-motion/walk/stage-apk"
import { describe, expect, it } from "vitest"

/** Jobs' story sample (WALK2), which the stand-in home answers and the walk reads. */
const sample = jobs.sample.parse(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../apps/www/tests/walk/jobs-week.json",
        import.meta.url
      ),
      "utf8"
    )
  )
)

const open: Step = { label: "Opens", action: { kind: "open" }, holdMs: 1000 }
const tap: Step = {
  label: "Taps",
  action: { kind: "tap", target: "button" },
  holdMs: 1000,
}

describe("a walk's steps (WALK1)", () => {
  it("open first, and only first, each held some time", () => {
    expect(stepProblems([open, tap])).toEqual([])
    expect(stepProblems([])).toEqual(["the walk has no steps"])
    expect(stepProblems([tap, open])).toEqual([
      "Taps: the first step opens",
      "Opens: only the first step opens",
    ])
    expect(
      stepProblems([
        open,
        { label: "Waits", action: { kind: "dwell", ms: 0 }, holdMs: 0 },
      ])
    ).toEqual(["Waits: it is held no time", "Waits: it dwells no time"])
  })

  it("Jobs' walk reads its story sample and walks in order", () => {
    const walk = jobs.walk(sample)
    expect(walk.stage.kind).toBe("apk")
    expect(stepProblems(walk.steps)).toEqual([])
    expect(walk.steps[0]?.until).toBe(`text=${sample.walk.title}`)
  })
})

describe("the APK stage's places (WALK1)", () => {
  it("puts a page's point where it lands on the whole screen", () => {
    // A 1080×1920 screen, its WebView below a 63 px status bar, 411 CSS px wide.
    const { viewport, place } = screenPlace(
      { x: 0, y: 63, width: 1080, height: 1857 },
      411.4285,
      { width: 1080, height: 1920 }
    )
    expect(viewport.scale).toBeCloseTo(2.625, 3)
    expect(viewport.width * viewport.scale).toBeCloseTo(1080, 6)
    expect(viewport.height * viewport.scale).toBeCloseTo(1920, 6)
    const at = place(100, 200)
    // In snip px: 100 × 2.625 across; 63 + 200 × 2.625 down.
    expect(at.x * viewport.scale).toBeCloseTo(262.5, 3)
    expect(at.y * viewport.scale).toBeCloseTo(588, 3)
  })

  it("finds the app's WebView in a uiautomator dump", () => {
    const xml =
      '<hierarchy><node class="android.widget.FrameLayout" package="dev.paulgsc.someui" bounds="[0,0][1080,1920]">' +
      '<node class="android.webkit.WebView" package="other.app" bounds="[0,0][10,10]" />' +
      '<node index="0" class="android.webkit.WebView" package="dev.paulgsc.someui" bounds="[0,63][1080,1794]" />' +
      "</node></hierarchy>"
    expect(webviewBounds(xml, "dev.paulgsc.someui")).toEqual({
      x: 0,
      y: 63,
      width: 1080,
      height: 1731,
    })
    expect(() => webviewBounds("<hierarchy/>", "dev.paulgsc.someui")).toThrow(
      "the app's WebView is not on screen"
    )
  })

  it("refuses a WebView with no width", () => {
    expect(() =>
      screenPlace({ x: 0, y: 0, width: 0, height: 0 }, 400, {
        width: 1080,
        height: 1920,
      })
    ).toThrow("the WebView has no width")
  })

  it("reads the installed version, or says the app is not installed", () => {
    expect(
      versionOf(
        "    versionCode=7 minSdk=24\n    versionName=0.0.7+snips.abc\n"
      )
    ).toBe("0.0.7+snips.abc")
    expect(() => versionOf("Unable to find package")).toThrow(
      "the app is not installed"
    )
  })
})

describe("the walk's microphone (WALK3)", () => {
  it("murmurs a mono 16 kHz WAV, the same bytes every time", () => {
    const wav = murmurWav(2)
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF")
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE")
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(16_000)
    expect(wav.readUInt32LE(40)).toBe(2 * 16_000 * 2)
    expect(wav.equals(murmurWav(2))).toBe(true)
    // Not silence: something for a level meter to show.
    let loudest = 0
    for (let i = 44; i < wav.length; i += 2) {
      loudest = Math.max(loudest, Math.abs(wav.readInt16LE(i)))
    }
    expect(loudest).toBeGreaterThan(5_000)
  })

  it("refuses a murmur of no time or over a minute", () => {
    expect(() => murmurWav(0)).toThrow()
    expect(() => murmurWav(61)).toThrow()
  })

  it("answers audio getUserMedia with the clip, and passes the rest on", () => {
    const script = microphoneScript({ kind: "murmur", seconds: 1 })
    expect(script).toContain(
      clipOf({ kind: "murmur", seconds: 1 }).toString("base64")
    )
    expect(script).toContain(
      "if (!constraints || !constraints.audio || constraints.video) return own(constraints)"
    )
  })
})
