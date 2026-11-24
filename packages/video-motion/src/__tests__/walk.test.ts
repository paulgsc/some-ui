import { readFileSync } from "node:fs"
import {
  homeCores,
  homeServer,
  homeServerRows,
  panelPath,
  rowPath,
  SERVER_GROUPINGS,
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
import type { PlaceRead } from "@video-motion/walk/stage-apk"
import {
  lookCommand,
  placeWhenLaidOut,
  screenPlace,
  versionOf,
  webviewBounds,
  WebViewNotLaidOut,
} from "@video-motion/walk/stage-apk"
import { ROW_PARAM } from "@video-motion/walk/stage-grafana"
import {
  walkthroughProblems,
  WalkthroughSchema,
} from "@video-motion/walkthrough"
import { describe, expect, it } from "vitest"
import { z } from "zod"

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

/** The week a test rewrites in the snips' sample, the rest kept as it is. */
const WEEK_ROUTE = "GET /api/v1/rust-weeks/2026-w45"
const SampleRoutes = z.looseObject({
  routes: z.record(z.string(), z.looseObject({ body: z.unknown() })),
})
const WeekBody = z.looseObject({
  week: z.looseObject({
    tickets: z.array(
      z.looseObject({
        forks: z.array(z.looseObject({ options: z.array(z.looseObject({})) })),
      })
    ),
  }),
})

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

  it("picks the first fork's first option not recommended, and refuses a fork with none", () => {
    const pickedIn = (value: unknown): unknown =>
      rustRounds
        .walk(rustRounds.sample.parse(value))
        .steps.find((s) => s.label === "An option picked")?.action
    expect(pickedIn(sample)).toEqual({
      kind: "tap",
      target: '[role="group"] >> nth=0 >> button[aria-pressed] >> nth=1',
    })
    // The sample with its first fork's options given `recommended` in turn.
    // `undefined` leaves the option saying nothing of it.
    const recommending = (
      flags: ReadonlyArray<boolean | undefined>
    ): unknown => {
      const copy = SampleRoutes.parse(structuredClone(sample))
      const route = copy.routes[WEEK_ROUTE]!
      const body = WeekBody.parse(route.body)
      const fork = body.week.tickets[0]!.forks[0]!
      fork.options = flags.map((recommended, i) => {
        const { recommended: _said, ...option } = fork.options[i] ?? {}
        return recommended === undefined ? option : { ...option, recommended }
      })
      copy.routes[WEEK_ROUTE] = { ...route, body }
      return copy
    }
    expect(pickedIn(recommending([false, true, false]))).toEqual({
      kind: "tap",
      target: '[role="group"] >> nth=0 >> button[aria-pressed] >> nth=0',
    })
    const refused = (value: unknown): ReadonlyArray<string> => {
      const read = rustRounds.sample.safeParse(value)
      return read.success ? [] : read.error.issues.map((i) => i.message)
    }
    expect(refused(recommending([true, true, true]))).toEqual([
      "TB-101's first fork has no option but the recommended",
    ])
    // An option that says nothing of it never passes for "not recommended".
    expect(refused(recommending([true, undefined, false]))).not.toEqual([])
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
        // A quoted `text="…"` is matched whole on screen, so whole here.
        /^".*"$/.test(text)
          ? literals.includes(text.slice(1, -1))
          : literals.some((l) => l.includes(text)),
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

/** A screen's dump holding the app's WebView at `bounds`. */
const dumpWith = (bounds: string): string =>
  `<hierarchy><node class="android.webkit.WebView" package="dev.paulgsc.someui" bounds="${bounds}" /></hierarchy>`

/**
 * The looks a stage takes, in turn, the last repeated, on a clock that each
 * look and each wait moves on: Snips Capture run 45321427650's Jobs walk
 * read its one dump while the app stalled as accessibility came on (#3489).
 */
function looking(looks: ReadonlyArray<PlaceRead | "hangs">): {
  read: () => Promise<PlaceRead>
  wait: Parameters<typeof placeWhenLaidOut>[3]
  taken: () => number
  now: () => number
} {
  let t = 0
  let i = 0
  /** A look that never ends: a `uiautomator dump` the device never answers. */
  const hung = new Promise<PlaceRead>(() => undefined)
  return {
    read: (): Promise<PlaceRead> => {
      const look = looks[Math.min(i, looks.length - 1)]!
      i += 1
      if (look === "hangs") return hung
      t += 1_000
      return Promise.resolve(look)
    },
    wait: {
      ms: 15_000,
      everyMs: 500,
      lookMs: 5_000,
      now: () => t,
      sleep: (ms): Promise<void> => {
        t += ms
        return Promise.resolve()
      },
      limit: <T>(p: Promise<T>, ms: number): Promise<T> => {
        if (p !== hung) return p
        t += ms
        return Promise.reject(
          new Error(`it took longer than ${String(ms / 1000)} s`)
        )
      },
    },
    taken: () => i,
    now: () => t,
  }
}

const LAID: PlaceRead = {
  dump: dumpWith("[0,63][1080,1794]"),
  innerWidth: 411,
  pixelRatio: 2.625,
}
const SCREEN = { width: 1080, height: 1920 }

describe("the APK stage reads the WebView once it is laid out (WALK9, #3489)", () => {
  const read = (
    stage: ReturnType<typeof looking>
  ): ReturnType<typeof placeWhenLaidOut> =>
    placeWhenLaidOut(stage.read, "dev.paulgsc.someui", SCREEN, stage.wait)

  it("looks again past a dump read before the WebView's node was laid out, and past a page read mid-layout", async () => {
    for (const early of [
      { ...LAID, dump: dumpWith("[0,0][0,0]") },
      { ...LAID, innerWidth: 0 },
      { ...LAID, innerWidth: Number.NaN },
      { ...LAID, pixelRatio: Number.NaN },
      // Any width would agree with an infinite ratio.
      { ...LAID, pixelRatio: Number.POSITIVE_INFINITY },
      { ...LAID, dump: "<hierarchy/>" },
      // A node with width, not yet the page's: 1080 / 980 is not 2.625.
      { ...LAID, innerWidth: 980 },
    ]) {
      const stage = looking([early, early, LAID])
      const { viewport } = await read(stage)
      expect(viewport.scale).toBeCloseTo(1080 / 411)
      // Two early looks, then two laid out that agree.
      expect(stage.taken()).toBe(4)
    }
  })

  it("waits for the WebView's box to hold still, its top settled with the insets", async () => {
    // The whole box lower, its height the same: only its top tells.
    const moving = { ...LAID, dump: dumpWith("[0,300][1080,2031]") }
    const stage = looking([moving, LAID])
    const { place } = await read(stage)
    expect(place(0, 0).y).toBeCloseTo(63 / (1080 / 411))
    expect(stage.taken()).toBe(3)
  })

  it("counts a look that throws as one that saw nothing", async () => {
    const stage = looking([LAID])
    let first = true
    const failing = {
      ...stage,
      read: (): Promise<PlaceRead> => {
        if (first) {
          first = false
          return Promise.reject(new Error("Execution context was destroyed"))
        }
        return stage.read()
      },
    }
    await read(failing)
    expect(stage.taken()).toBe(2)
  })

  it("reads once two looks in a row agree, never two with one not laid out between", async () => {
    const stage = looking([LAID])
    await read(stage)
    expect(stage.taken()).toBe(2)
    const broken = looking([
      LAID,
      { ...LAID, dump: dumpWith("[0,0][0,0]") },
      LAID,
      LAID,
    ])
    await read(broken)
    expect(broken.taken()).toBe(4)
  })

  it("gives up past its bound, naming the read with no width and keeping the dump", async () => {
    const zero = dumpWith("[0,0][0,0]")
    const stage = looking([{ ...LAID, dump: zero }])
    const failed = await read(stage).catch((e: unknown) => e)
    expect(failed).toBeInstanceOf(WebViewNotLaidOut)
    if (!(failed instanceof WebViewNotLaidOut)) return
    expect(failed.message).toBe(
      "the WebView was never laid out: the app's WebView is 0 px wide in the screen's dump"
    )
    expect(failed.dump).toBe(zero)
    // Each look 1 s and each wait 0.5 s: the 11th starts at 15 s, the last
    // one that may, and none starts after.
    expect(stage.taken()).toBe(11)
    expect(stage.now()).toBeLessThanOrEqual(15_000 + 5_000)
  })

  it("cuts a look that never ends at its own bound, and still gives up within the wait and one look", async () => {
    const zero = dumpWith("[0,0][0,0]")
    // A look that hangs between two that agree: it saw nothing, so the two
    // around it are not two in a row.
    const between = looking([LAID, "hangs", LAID, LAID])
    await read(between)
    expect(between.taken()).toBe(4)
    const stuck = looking([{ ...LAID, dump: zero }, "hangs"])
    const failed = await read(stuck).catch((e: unknown) => e)
    expect(failed).toMatchObject({
      message:
        "the WebView was never laid out: the look failed: it took longer than 5 s",
      dump: zero,
    })
    expect(stuck.now()).toBeLessThanOrEqual(15_000 + 5_000)
  })

  it("says whether the box was still moving or laid out only on the last look", async () => {
    const lower = { ...LAID, dump: dumpWith("[0,300][1080,2031]") }
    const moving = looking(
      Array.from({ length: 11 }, (_, i) => (i % 2 === 0 ? LAID : lower))
    )
    expect(await read(moving).catch((e: unknown) => e)).toMatchObject({
      message:
        "the WebView was never laid out: the WebView's box was still moving",
    })
    const zero = { ...LAID, dump: dumpWith("[0,0][0,0]") }
    const late = looking([...Array.from({ length: 10 }, () => zero), LAID])
    expect(await read(late).catch((e: unknown) => e)).toMatchObject({
      message:
        "the WebView was never laid out: the WebView was laid out only on the last look",
    })
  })

  it("gives each look its own file, its dump ended by the device before the look's own bound", () => {
    expect(lookCommand(1, 5_000)).toBe(
      "timeout 4 uiautomator dump /sdcard/walk-ui-1.xml >/dev/null && cat /sdcard/walk-ui-1.xml; rm -f /sdcard/walk-ui-1.xml"
    )
    // A late look's rm or dump never names a later look's file.
    const files = (n: number): Array<string> =>
      lookCommand(n, 5_000).match(/\/sdcard\/\S+\.xml/g) ?? []
    expect(new Set(files(2))).toEqual(new Set(["/sdcard/walk-ui-2.xml"]))
    expect(files(2).some((f) => files(3).includes(f))).toBe(false)
    for (const lookMs of [2_000, 5_000, 12_000]) {
      const seconds = Number(
        /^timeout (\d+) /.exec(lookCommand(1, lookMs))?.[1]
      )
      expect(seconds * 1000).toBeLessThan(lookMs)
    }
  })

  it("keeps the last screen's dump, not the error a failed dump reads back", async () => {
    const zero = dumpWith("[0,0][0,0]")
    const stage = looking([
      { ...LAID, dump: zero },
      {
        ...LAID,
        dump: "cat: /sdcard/walk-ui-2.xml: No such file or directory",
      },
    ])
    const failed = await read(stage).catch((e: unknown) => e)
    expect(failed).toMatchObject({
      message:
        "the WebView was never laid out: the app's WebView is not on screen",
      dump: zero,
    })
  })

  it("keeps the last dump a look read when the last look throws", async () => {
    const zero = dumpWith("[0,0][0,0]")
    const stage = looking([{ ...LAID, dump: zero }])
    let looks = 0
    const failing = {
      ...stage,
      read: (): Promise<PlaceRead> => {
        looks += 1
        return looks === 1
          ? stage.read()
          : stage.read().then(() => Promise.reject(new Error("gone")))
      },
    }
    const failed = await read(failing).catch((e: unknown) => e)
    expect(failed).toMatchObject({
      message: "the WebView was never laid out: the look failed: gone",
      dump: zero,
    })
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

/** What Site Assets' dashboards job writes for the walks (`motion dashboards-sample`). */
const HOME_SAMPLE = {
  schema: "some-ui.walk-sample/home-dashboards/2",
  version: "0.0.0+4b98b6f2d410",
  origin: "http://127.0.0.1:3000",
  to: "2026-11-16T00:00:00Z",
  days: 7,
}

describe("the server's dashboards, on sample telemetry (#3401)", () => {
  it("reads the sample week, and refuses any other window", () => {
    expect(homeServer.sample.safeParse(HOME_SAMPLE).success).toBe(true)
    for (const bad of [
      { ...HOME_SAMPLE, to: "2026-11-23T00:00:00Z" },
      { ...HOME_SAMPLE, to: "2026-11-16T05:00:00Z" },
      { ...HOME_SAMPLE, days: 1 },
      { ...HOME_SAMPLE, origin: "file:///etc" },
      { ...HOME_SAMPLE, version: "" },
      { ...HOME_SAMPLE, schema: "some-ui.walk-sample/home-dashboards/1" },
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

  it("walks each grouping's two panels, each grouping's row, and the cores' one panel", () => {
    const sample = homeServer.sample.parse(HOME_SAMPLE)
    const server = homeServer.walk(sample)
    const rows = homeServerRows.walk(sample)
    const cores = homeCores.walk(sample)
    expect(server.stage).toMatchObject({
      kind: "grafana",
      version: "0.0.0+4b98b6f2d410",
    })
    expect(server.steps).toHaveLength(2 * SERVER_GROUPINGS.length)
    expect(stepProblems(server.steps)).toEqual([])
    expect(server.steps.slice(1).map((step) => step.action.kind)).toEqual(
      Array.from({ length: 2 * SERVER_GROUPINGS.length - 1 }, () => "visit")
    )
    expect(rows.steps.map((step) => step.label)).toEqual(
      SERVER_GROUPINGS.map((g) => g.label)
    )
    expect(stepProblems(rows.steps)).toEqual([])
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

  it("a row's page is its whole dashboard, in kiosk, naming the row the stage shoots", () => {
    const sample = homeServer.sample.parse(HOME_SAMPLE)
    for (const grouping of SERVER_GROUPINGS) {
      const url = new URL(rowPath(grouping, sample), sample.origin)
      expect(url.pathname).toBe(`/d/${grouping.dashboard}/`)
      expect(url.searchParams.get(ROW_PARAM)).toBe(grouping.row)
      expect(url.searchParams.has("kiosk")).toBe(true)
      expect(url.search.endsWith("&kiosk")).toBe(true)
    }
  })

  it("the server episode's words fit its walk, a chapter a grouping", () => {
    const words = WalkthroughSchema.parse(
      JSON.parse(
        readFileSync(
          new URL("../../walks/home-server.json", import.meta.url),
          "utf8"
        )
      )
    )
    const screens = 2 * SERVER_GROUPINGS.length
    expect(words.fill.chapters.map((c) => c.from)).toEqual(
      SERVER_GROUPINGS.map((_, i) => 2 * i)
    )
    const snips = Array.from({ length: screens }, (_, i) => ({
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
        lengthMs: screens * 2400,
      })
    ).toEqual([])
  })
})
