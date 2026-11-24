import { readFileSync } from "node:fs"
import {
  homeCores,
  homeServer,
  panelPath,
} from "@video-motion/walk/home-dashboards"
import { jobs } from "@video-motion/walk/jobs"
import {
  clipOf,
  microphoneScript,
  murmurWav,
} from "@video-motion/walk/microphone"
import type { Step } from "@video-motion/walk/run"
import { stepProblems } from "@video-motion/walk/run"
import { rustRounds } from "@video-motion/walk/rust-rounds"
import {
  screenPlace,
  versionOf,
  webviewBounds,
} from "@video-motion/walk/stage-apk"
import {
  walkthroughProblems,
  WalkthroughSchema,
} from "@video-motion/walkthrough"
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

/** A file of the repository, as text. */
const repoFile = (path: string): string =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8")

describe("Rust Rounds' walk (#3476)", () => {
  const sample: unknown = JSON.parse(
    repoFile("apps/mobile/snips/sample-routes.json")
  )

  it("reads the snips' sample, opening its newest week's first ticket, and walks in order", () => {
    const walk = rustRounds.walk(rustRounds.sample.parse(sample))
    expect(walk.stage).toMatchObject({ kind: "apk", path: "/rust-rounds" })
    expect(stepProblems(walk.steps)).toEqual([])
    expect(walk.steps[0]?.until).toBe("text=Tallowbrook")
    expect(walk.steps[1]?.action).toEqual({
      kind: "tap",
      target: `button:has-text("TB-101 · Print each queued label's address")`,
    })
    expect(walk.steps.at(-1)?.until).toBe(`button:has-text("Send to home")`)
  })

  it("picks the first fork's first option not recommended", () => {
    const walk = rustRounds.walk(rustRounds.sample.parse(sample))
    const picked = walk.steps.find((s) => s.label === "An option picked")
    expect(picked?.action).toEqual({
      kind: "tap",
      target: '[role="group"] >> nth=0 >> button[aria-pressed] >> nth=1',
    })
  })

  it("looks only for words the week's screens say", () => {
    // The words table's string literals, its comments left out, so a reworded
    // button can't pass on a comment that still says the old words.
    const literals = [
      ...repoFile("packages/ui/rust-rounds/src/lib/week-play/words.ts")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .matchAll(/"((?:[^"\\]|\\.)*)"|`([^`]*)`/g),
    ].map((m) => m[1] ?? m[2] ?? "")
    const read = rustRounds.sample.parse(sample)
    const walk = rustRounds.walk(read)
    const said = walk.steps
      .flatMap((step) => [
        step.until,
        step.action.kind === "tap" ? step.action.target : undefined,
      ])
      .flatMap((selector) => {
        const quoted = /has-text\("([^"]+)"\)|^text=(.+)$/.exec(selector ?? "")
        return quoted === null ? [] : [quoted[1] ?? quoted[2] ?? ""]
      })
      // The sample's own words (the company, a ticket, an exercise).
      .filter(
        (text) =>
          text !== read.company &&
          text !== `${read.ticket.id} · ${read.ticket.title}` &&
          text !== read.ticket.academy[0]?.title
      )
    expect(said.length).toBeGreaterThan(5)
    for (const text of said) {
      expect(
        literals.some((l) => l.includes(text.replace(/^"|"$/g, ""))),
        text
      ).toBe(true)
    }
  })

  it("refuses a sample that serves no week", () => {
    expect(
      rustRounds.sample.safeParse({
        schema: "some-ui.stub-sample/snips/1",
        routes: { "GET /api/v1/rust-weeks": { body: { weeks: [] } } },
      }).success
    ).toBe(false)
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

/** What home writes for its render worker (`site_shots` in paulgsc/server). */
const HOME_SAMPLE = {
  schema: "some-ui.walk-sample/home-dashboards/1",
  version: "0.42.1",
  origin: "http://grafana:3000",
  to: "2026-11-16T00:00:00Z",
  days: 7,
}

describe("home's dashboards (C1073, #3415)", () => {
  it("reads home's sample, and refuses a window that does not end at a UTC midnight", () => {
    expect(homeServer.sample.safeParse(HOME_SAMPLE).success).toBe(true)
    for (const bad of [
      { ...HOME_SAMPLE, to: "2026-11-23T05:00:00Z" },
      { ...HOME_SAMPLE, days: 1 },
      { ...HOME_SAMPLE, to: "2999-01-01T00:00:00Z" },
      { ...HOME_SAMPLE, origin: "file:///etc" },
      { ...HOME_SAMPLE, version: "" },
      { ...HOME_SAMPLE, token: "x" },
    ]) {
      expect(homeServer.sample.safeParse(bad).success).toBe(false)
    }
  })

  it("opens each panel alone, over the sample's window, dark and in UTC", () => {
    const sample = homeServer.sample.parse(HOME_SAMPLE)
    const path = panelPath(
      { dashboard: "file-host-dashboard", id: 943, label: "Availability" },
      sample
    )
    const url = new URL(path, sample.origin)
    expect(url.pathname).toBe("/d-solo/file-host-dashboard/")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      orgId: "1",
      panelId: "943",
      from: String(Date.parse("2026-11-09T00:00:00Z")),
      to: String(Date.parse("2026-11-16T00:00:00Z")),
      theme: "dark",
      timezone: "utc",
    })
  })

  it("walks the server's six panels and the cores' one, each a step the runner takes", () => {
    const sample = homeServer.sample.parse(HOME_SAMPLE)
    const server = homeServer.walk(sample)
    const cores = homeCores.walk(sample)
    expect(server.stage).toMatchObject({ kind: "grafana", version: "0.42.1" })
    expect(server.steps).toHaveLength(6)
    expect(stepProblems(server.steps)).toEqual([])
    expect(server.steps.slice(1).map((step) => step.action.kind)).toEqual(
      Array.from({ length: 5 }, () => "visit")
    )
    expect(cores.steps).toHaveLength(1)
    expect(cores.stage.kind === "grafana" ? cores.stage.page : "").toMatch(
      /^\/d-solo\/who-dunnit-forensic\/\?.*panelId=32/
    )
  })

  it("a visit stays on the stage: a path from /, never another origin", () => {
    const visit = (path: string): Step => ({
      label: "Visits",
      action: { kind: "visit", path },
      holdMs: 1000,
    })
    expect(stepProblems([open, visit("/d-solo/x/?panelId=1")])).toEqual([])
    for (const path of [
      "https://example.com/",
      "//example.com/x",
      "/\\example.com/x",
      "/\t/example.com/x",
      "x",
    ]) {
      expect(stepProblems([open, visit(path)])).toEqual([
        "Visits: it visits a path of the stage, from /",
      ])
    }
  })

  it("the server clip's words fit its walk of six screens", () => {
    const words = WalkthroughSchema.parse(
      JSON.parse(
        readFileSync(
          new URL("../../walks/home-server.json", import.meta.url),
          "utf8"
        )
      )
    )
    const snips = Array.from({ length: 6 }, (_, i) => ({
      file: `snips/0${String(i + 1)}.png`,
      label: `panel ${String(i + 1)}`,
      atMs: i * 2400,
    }))
    expect(
      walkthroughProblems(words, {
        schema: "some-ui.walk/1",
        app: "home-server",
        version: "0.42.1",
        viewport: { width: 1000, height: 640, scale: 1 },
        snips,
        taps: [],
        lengthMs: 6 * 2400,
      })
    ).toEqual([])
  })
})
