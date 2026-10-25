/**
 * Records the phone's study sessions as takes for the Build Journal shorts:
 * one continuous take per walk, at phone size, on the sample build's data.
 * The frames are a CDP screencast at device pixels (sharper than Playwright's
 * recordVideo), with a ring where each tap lands, as Android's "Show taps"
 * draws one. Each walk writes, under `<out>/<walk>/`:
 *
 * - `frames/` and `frames.ffconcat`, each frame held until the next;
 * - `<walk>.mp4` at 30 fps, when a system ffmpeg is on PATH (the bundled one
 *   cannot transcode; without one, the line to run is printed);
 * - `marks.json`: each step's time in the take, and the box of what it
 *   tapped, in css px, for framing the edit;
 * - a still at the end of each step.
 *
 *   pnpm --filter www build:apk-sample
 *   pnpm --filter www record:apk-shorts --walk topik [--pace 1.2] [--out out/apk-shorts]
 *
 * It serves the built app (never `vite dev`: the dev tools would be in the
 * frame). `build:apk-sample` is the `mobile` profile, so the screens are the
 * phone's own (the wing bar, Practice, Bites), on the viewer build's sample
 * data: the phone's SQLite plugin is native-only, so the device build cannot
 * run in a browser. Say so on screen: the footage is the phone build in a
 * browser, not the APK. Sound is off (Chromium here has no Korean voice), and
 * Bites hears a test signal, never a voice.
 *
 * Walks: `topik` (Korean listening, the tree prompt's worked example opened
 * from storage), `topik-write` (Write your own drama), `leetype` (the sample
 * session, One node), `bites` (Not today? Say why), `bites-full` (six short
 * takes fill the phone). Holds are paced for narration; `--pace` scales them.
 */

import { spawnSync } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  chromium,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test"
import { serve } from "@tests/ui-fit/harness"

const VIEWPORT = { width: 412, height: 915 }
const SCALE = 2
const FPS = 30

type Target =
  | {
      readonly role: "button" | "checkbox"
      readonly name?: string | RegExp
      readonly nth?: number
    }
  | { readonly text: string }
  | { readonly label: string }

type Step =
  | {
      readonly tap: Target
      readonly mark: string
      readonly hold: number
      readonly force?: true
      readonly optional?: true
    }
  | {
      readonly open: Target
      readonly file: string
      readonly mark: string
      readonly hold: number
    }
  | {
      readonly type: Target
      readonly text: string
      readonly mark: string
      readonly hold: number
    }
  | {
      readonly glide: number | { readonly to: Target; readonly offset: number }
      readonly ms: number
      readonly mark: string
      readonly hold: number
    }
  | { readonly mark: string; readonly hold: number }

type Walk = {
  readonly start: string
  /** Taken before the take starts recording: getting to where it begins. */
  readonly setup?: ReadonlyArray<Step>
  readonly steps: ReadonlyArray<Step>
  readonly microphone?: true
}

const button = (name: string | RegExp, nth?: number): Target => ({
  role: "button",
  name,
  ...(nth === undefined ? {} : { nth }),
})

const DRAMA = "first-tea.json"
const MIC = "test-signal.wav"

const WALKS: Readonly<Record<string, Walk>> = {
  topik: {
    start: "/practice",
    steps: [
      { mark: "practice home", hold: 4000 },
      { tap: { text: "Next lesson" }, mark: "tap Next lesson", hold: 1800 },
      {
        tap: button("Continue muted"),
        mark: "sound notice: Continue muted",
        hold: 3500,
      },
      {
        open: { text: "Open a scene from storage" },
        file: DRAMA,
        mark: "open a scene from storage",
        hold: 6500,
      },
      {
        tap: button("Next"),
        mark: "tap Next: the chairman's line",
        hold: 3000,
      },
      { tap: button("Show English"), mark: "tap Show English", hold: 4500 },
      { tap: button("Next"), mark: "tap Next: the choice", hold: 7000 },
      { tap: button("응, 마실래."), mark: "tap the casual reply", hold: 7000 },
      {
        tap: button("Next"),
        mark: "tap Next: the room goes quiet",
        hold: 4500,
      },
      { tap: button("Next"), mark: "tap Next: the repair choice", hold: 6500 },
      {
        tap: button("죄송합니다, 회장님. 제가 실수했습니다."),
        mark: "tap the formal apology",
        hold: 4500,
      },
      { tap: button("Next"), mark: "tap Next: the ending", hold: 7000 },
      {
        tap: { text: "작가의 말" },
        mark: "open the author's note",
        hold: 3000,
      },
      { tap: button("Why?", 0), mark: "tap Why?", hold: 6500 },
    ],
  },
  "topik-write": {
    start: "/practice",
    setup: [
      { tap: { text: "Next lesson" }, mark: "tap Next lesson", hold: 1500 },
      { tap: button("Continue muted"), mark: "sound notice", hold: 800 },
    ],
    steps: [
      { mark: "korean listening", hold: 3000 },
      {
        tap: { text: "Write your own drama" },
        mark: "tap Write your own drama",
        hold: 11000,
      },
    ],
  },
  leetype: {
    start: "/sessions",
    steps: [
      { mark: "study tab", hold: 3000 },
      { tap: { text: "LeetType" }, mark: "tap the LeetType draft", hold: 1400 },
      { tap: { text: "Review" }, mark: "tap Review", hold: 1400 },
      { tap: button("Save & Play"), mark: "tap Save & Play", hold: 3500 },
      { tap: button(/^Play /), mark: "tap Play One node", hold: 3500 },
      {
        tap: button(/the whole session/),
        mark: "tap the whole session",
        hold: 4000,
      },
      {
        tap: button("Start with round 1"),
        mark: "tap Start with round 1",
        hold: 9000,
      },
      {
        glide: { to: button(/^Run fsync once a second/), offset: 260 },
        ms: 2200,
        mark: "glide to the options",
        hold: 3500,
      },
      {
        tap: button(/^Write the record to the log file twice/),
        mark: "tap a wrong pick",
        hold: 7000,
      },
      {
        tap: button("Show the worked answer"),
        mark: "tap Show the worked answer",
        hold: 3000,
      },
      {
        glide: 420,
        ms: 5000,
        mark: "glide through the worked answer",
        hold: 3000,
      },
      { tap: button("Continue"), mark: "tap Continue: a reading", hold: 8000 },
      {
        glide: { to: button("Read now"), offset: 380 },
        ms: 1500,
        mark: "glide to the reading's actions",
        hold: 2000,
      },
      {
        tap: button("Save it; this round waits"),
        mark: "tap Save it",
        hold: 7000,
      },
      {
        glide: { to: button(/^Ten threads/), offset: 200 },
        ms: 2200,
        mark: "glide to round 2's options",
        hold: 3000,
      },
      {
        tap: button(/^Writes that arrive during an fsync wait/),
        mark: "tap group commit",
        hold: 7000,
      },
      { tap: button("Continue"), mark: "tap Continue", hold: 3500 },
      {
        tap: button("Skip"),
        mark: "tap Skip: the optional reading",
        hold: 3500,
        optional: true,
      },
      {
        tap: button(/^The power cut, on one node/),
        mark: "tap the take",
        hold: 4500,
      },
      {
        type: { label: "Your answer, typed" },
        text: "The ack went out while the record was only in memory, so the power cut erased it. Fix: reply only after fsync returns, about 1 ms a write. Group commit wins the rate back.",
        mark: "type the answer",
        hold: 1500,
      },
      { tap: button("Done"), mark: "tap Done: the rubric", hold: 3500 },
      { tap: { role: "checkbox", nth: 0 }, mark: "tick 1", hold: 1500 },
      { tap: { role: "checkbox", nth: 1 }, mark: "tick 2", hold: 1500 },
      { tap: { role: "checkbox", nth: 2 }, mark: "tick 3", hold: 3000 },
      { tap: button("Done"), mark: "tap Done: the end screen", hold: 6500 },
    ],
  },
  bites: {
    start: "/practice",
    microphone: true,
    steps: [
      { mark: "practice home", hold: 7000 },
      {
        tap: { text: "Not today? Say why" },
        mark: "tap Not today? Say why",
        hold: 20000,
      },
      {
        tap: button(/^Done, keep it/),
        force: true,
        mark: "tap to keep it",
        hold: 14000,
      },
      { tap: button(/^Play /, 0), force: true, mark: "tap Play", hold: 22000 },
    ],
  },
  "bites-full": {
    start: "/soundbites",
    microphone: true,
    steps: [
      { mark: "bites, empty", hold: 1500 },
      ...Array.from(
        { length: 6 },
        (_, i): ReadonlyArray<Step> => [
          {
            tap: button("Start talking"),
            force: true,
            mark: `take ${i + 1}: talk`,
            hold: 2200,
          },
          {
            tap: button(/^Done, keep it/),
            force: true,
            mark: `take ${i + 1}: keep`,
            hold: 1300,
          },
        ]
      ).flat(),
      { mark: "full", hold: 2000 },
      { glide: 400, ms: 2500, mark: "glide to the kept takes", hold: 8000 },
    ],
  },
}

const { values } = parseArgs({
  options: {
    walk: { type: "string" },
    out: { type: "string", default: "out/apk-shorts" },
    dist: { type: "string", default: "out/apk-sample" },
    pace: { type: "string", default: "1" },
    tz: { type: "string", default: "America/Los_Angeles" },
  },
})

const walkName = values.walk ?? ""
if (!Object.hasOwn(WALKS, walkName)) {
  throw new Error(`--walk is one of: ${Object.keys(WALKS).join(", ")}`)
}
const walk = WALKS[walkName]
const pace = Number(values.pace)
const outDir = resolve(values.out, walkName)

/** A ring where a finger lands, fading out. Drawn in the page, not the app. */
const TAP_RINGS = `
addEventListener("pointerdown", (e) => {
  const d = document.createElement("div")
  d.setAttribute("aria-hidden", "true")
  Object.assign(d.style, { position: "fixed", left: e.clientX - 22 + "px", top: e.clientY - 22 + "px",
    width: "44px", height: "44px", borderRadius: "50%", background: "rgba(80,80,80,0.28)",
    border: "2px solid rgba(255,255,255,0.85)", boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
    pointerEvents: "none", zIndex: 2147483647, transition: "opacity 450ms ease-out, transform 450ms ease-out" })
  document.documentElement.appendChild(d)
  requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = "0"; d.style.transform = "scale(1.6)" }))
  setTimeout(() => d.remove(), 600)
}, true)`

/** The tree prompt's worked example: the one drama every model is shown. */
async function workedExample(): Promise<string> {
  const prompt = await readFile(
    resolve(
      import.meta.dirname,
      "../../../../packages/ui/topik/src/lib/topik/generation/tree-prompt.md"
    ),
    "utf8"
  )
  const section = prompt.slice(prompt.indexOf("## Worked example"))
  const open = section.indexOf("```json\n") + "```json\n".length
  return section.slice(open, section.indexOf("```", open))
}

/**
 * Twenty seconds of pink-ish noise whose loudness rises and falls like
 * speech, for Chromium's fake microphone: the level meter moves, and no voice
 * is recorded or made up.
 */
function testSignal(): Buffer {
  const rate = 48_000
  const n = rate * 20
  const wav = Buffer.alloc(44 + n * 2)
  wav.write("RIFF", 0)
  wav.writeUInt32LE(36 + n * 2, 4)
  wav.write("WAVEfmt ", 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write("data", 36)
  wav.writeUInt32LE(n * 2, 40)
  let low = 0
  for (let i = 0; i < n; i++) {
    const t = i / rate
    low = 0.97 * low + 0.03 * (Math.random() * 2 - 1)
    const envelope =
      0.15 +
      0.85 *
        Math.abs(
          Math.sin(2 * Math.PI * 2.1 * t) *
            Math.sin(2 * Math.PI * 0.37 * t + 0.5)
        ) **
          0.7
    wav.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, low * 6 * envelope)) * 20_000),
      44 + i * 2
    )
  }
  return wav
}

function locate(page: Page, target: Target): Locator {
  if ("text" in target)
    return page.getByText(target.text, { exact: true }).first()
  if ("label" in target) return page.getByLabel(target.label).first()
  const named =
    target.name === undefined
      ? page.getByRole(target.role)
      : page.getByRole(target.role, {
          name: target.name,
          exact: typeof target.name === "string",
        })
  return named.nth(target.nth ?? 0)
}

type Box = { x: number; y: number; width: number; height: number }

/** Scrolls whatever scrolls under the thumb by `dy` css px over `ms`, eased. */
async function glide(page: Page, dy: number, ms: number): Promise<void> {
  // A string, as TAP_RINGS is: tsx names the functions it compiles with a
  // helper the page does not have.
  await page.evaluate(`new Promise((done) => {
    let el = document.elementFromPoint(${VIEWPORT.width / 2}, ${VIEWPORT.height * 0.57})
    const scrolls = (e) => e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)
    while (el && !scrolls(el)) el = el.parentElement
    const box = el ?? document.scrollingElement ?? document.documentElement
    const from = box.scrollTop
    const t0 = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ${ms})
      box.scrollTop = from + (${dy} * (1 - Math.cos(Math.PI * k))) / 2
      if (k < 1) requestAnimationFrame(step)
      else done()
    }
    requestAnimationFrame(step)
  })`)
}

/** Frames as the page paints them, each held until the next. */
async function screencast(
  cdp: CDPSession,
  dir: string
): Promise<() => Promise<number>> {
  await mkdir(join(dir, "frames"), { recursive: true })
  const frames: Array<{ file: string; t: number }> = []
  const writes: Array<Promise<void>> = []
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = `frames/f${String(frames.length).padStart(6, "0")}.jpg`
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 })
    writes.push(writeFile(join(dir, file), Buffer.from(data, "base64")))
    void cdp
      .send("Page.screencastFrameAck", { sessionId })
      .catch(() => undefined)
  })
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: VIEWPORT.width * SCALE,
    maxHeight: VIEWPORT.height * SCALE,
    everyNthFrame: 1,
  })
  return async () => {
    const end = Date.now() / 1000
    await cdp.send("Page.stopScreencast")
    await Promise.all(writes)
    const lines = frames.map(
      (f, i) =>
        `file ${f.file}\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? end) - f.t).toFixed(4)}\n`
    )
    const last = frames.at(-1)
    await writeFile(
      join(dir, "frames.ffconcat"),
      `ffconcat version 1.0\n${lines.join("")}${last ? `file ${last.file}\n` : ""}`
    )
    return end - (frames[0]?.t ?? end)
  }
}

const dist = resolve(values.dist)
const site = await serve(dist, { fallback: "index.html" })
await mkdir(outDir, { recursive: true })
if ([...(walk.setup ?? []), ...walk.steps].some((step) => "open" in step)) {
  await writeFile(join(outDir, DRAMA), await workedExample())
}
const mic = join(outDir, MIC)
if (walk.microphone) await writeFile(mic, testSignal())

const browser = await chromium.launch({
  ...(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
    : {}),
  args: walk.microphone
    ? [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${mic}`,
      ]
    : [],
})

try {
  await rm(join(outDir, "frames"), { recursive: true, force: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    timezoneId: values.tz,
    permissions: walk.microphone ? ["microphone"] : [],
  })
  await context.addInitScript(TAP_RINGS)
  const page = await context.newPage()
  await page.goto(`${site.origin}${walk.start}`, { waitUntil: "networkidle" })

  const marks: Array<{ mark: string; t: number; box?: Box }> = []
  let t0 = Date.now()
  let n = 0
  const run = async (step: Step, record: boolean): Promise<void> => {
    let box: Box | undefined
    if ("tap" in step || "open" in step || "type" in step) {
      const target = locate(
        page,
        "tap" in step ? step.tap : "open" in step ? step.open : step.type
      )
      if ("tap" in step && step.optional && (await target.count()) === 0) return
      // A pulsing control (Bites' recorder) never counts as stable, which
      // scrolling waits for; a forced tap is on screen already.
      if (!("tap" in step && step.force)) await target.scrollIntoViewIfNeeded()
      box = (await target.boundingBox()) ?? undefined
      if (record)
        marks.push({
          mark: step.mark,
          t: (Date.now() - t0) / 1000,
          ...(box ? { box } : {}),
        })
      if ("open" in step) {
        const chooser = page.waitForEvent("filechooser")
        await target.tap()
        await (await chooser).setFiles(join(outDir, step.file))
      } else if ("type" in step) {
        await target.tap()
        await page.keyboard.type(step.text, { delay: 28 })
      } else {
        await target.tap(step.force ? { force: true } : {})
      }
    } else if ("glide" in step) {
      if (record) marks.push({ mark: step.mark, t: (Date.now() - t0) / 1000 })
      const dy =
        typeof step.glide === "number"
          ? step.glide
          : ((await locate(page, step.glide.to).boundingBox())?.y ??
              step.glide.offset) - step.glide.offset
      await glide(page, dy, step.ms)
    } else if (record) {
      marks.push({ mark: step.mark, t: (Date.now() - t0) / 1000 })
    }
    await page.waitForTimeout(step.hold * (record ? pace : 1))
    if (record) {
      n += 1
      const slug = step.mark
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
      await page.screenshot({
        path: join(outDir, `${String(n).padStart(2, "0")}-${slug}.png`),
      })
    }
  }

  for (const step of walk.setup ?? []) await run(step, false)
  const stop = await screencast(await context.newCDPSession(page), outDir)
  t0 = Date.now()
  for (const step of walk.steps) await run(step, true)
  await page.waitForTimeout(1500)
  const seconds = await stop()
  await context.close()

  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim()
  await writeFile(
    join(outDir, "marks.json"),
    JSON.stringify(
      {
        walk: walkName,
        commit,
        viewport: VIEWPORT,
        scale: SCALE,
        pace,
        seconds,
        marks,
      },
      null,
      2
    )
  )

  const mp4 = join(outDir, `${walkName}.mp4`)
  const encode = [
    "-v",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(outDir, "frames.ffconcat"),
    "-vf",
    `fps=${FPS},scale=${VIEWPORT.width * SCALE}:${VIEWPORT.height * SCALE}:flags=lanczos,format=yuv420p`,
    "-c:v",
    "libx264",
    "-crf",
    "16",
    mp4,
  ]
  const ffmpeg = spawnSync("ffmpeg", encode, { stdio: "inherit" })
  console.log(
    ffmpeg.status === 0
      ? `recorded ${walkName}: ${seconds.toFixed(1)}s, ${marks.length} marks -> ${mp4}`
      : `recorded ${walkName}: ${seconds.toFixed(1)}s of frames; encode with: ffmpeg ${encode.join(" ")}`
  )
} finally {
  await browser.close()
  await site.close()
}
