/**
 * Records burn-ins for the renderer (STUDIO ST15): `@some-ui/video-render`'s
 * `Ports.recordBurnIn`, filled by the built app's `/burn-ins?record` page in
 * a headless browser at 1080x1920.
 *
 * The page holds `@some-ui/burn-ins`' recording protocol (its
 * `runtime/record.ts`): `load` checks a burn-in and shows it, `seek` shows a
 * moment and answers once it is painted with its fonts, with a key for the
 * picture. For each frame of the burn-in this seeks to that frame's exact
 * time (`frame / fps`, never rounded), captures the picture with
 * transparency only when the key changes, and pipes every frame, as PNG, to
 * ffmpeg, which writes the lossless `.mov` the renderer lays over the video.
 * A burn-in that holds still is captured once, however long it lasts.
 */

import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import type {
  BurnInRequest,
  Rendered,
  RenderOptions,
} from "@some-ui/video-render"
import { renderFolder } from "@some-ui/video-render/node"

/** The page global the protocol is reached by (burn-ins' `RECORDER_GLOBAL`). */
const GLOBAL = "someUiBurnIns"

/** The frame every burn-in design is drawn for (burn-ins' `FRAME`). */
export const RECORDING_SIZE = { width: 1080, height: 1920 } as const

type Loaded =
  | { ok: true; value: { runtimeMs: number | null } }
  | { ok: false; problems: Array<string> }

const isLoaded = (x: unknown): x is Loaded =>
  typeof x === "object" &&
  x !== null &&
  typeof Reflect.get(x, "ok") === "boolean"

/** Opens the recorder's page on `page`, which must be 1080x1920 at scale 1. */
export async function openRecorder(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/burn-ins?record=true`)
  await page.addStyleTag({
    content: "html, body, #app { background: transparent !important; }",
  })
  await page.waitForFunction((name) => Reflect.has(window, name), GLOBAL)
}

/** Calls one of the protocol's methods on the page and returns its answer. */
async function call(
  page: Page,
  method: "load" | "seek",
  arg: unknown
): Promise<unknown> {
  return page.evaluate(
    async ({ name, method, arg }) => {
      const recorder: unknown = Reflect.get(window, name)
      const fn: unknown =
        typeof recorder === "object" && recorder !== null
          ? Reflect.get(recorder, method)
          : null
      const out: unknown =
        typeof fn === "function"
          ? await Reflect.apply(fn, recorder, [arg])
          : null
      return out
    },
    { name: GLOBAL, method, arg }
  )
}

async function load(page: Page, r: BurnInRequest): Promise<Loaded> {
  const loaded = await call(page, "load", {
    kind: r.kind,
    design: r.design,
    params: r.params,
  })
  if (!isLoaded(loaded)) throw new Error("the recorder's page did not answer")
  return loaded
}

async function seek(page: Page, atMs: number): Promise<string> {
  const key = await call(page, "seek", atMs)
  if (typeof key !== "string")
    throw new Error("the recorder's page did not answer")
  return key
}

/**
 * The renderer's `recordBurnIn` port over a page `openRecorder` opened, for
 * the video in `root`. Says why on `report` when a burn-in can't be drawn.
 */
export function burnInRecorder(
  page: Page,
  root: string,
  report: (line: string) => void
): (request: BurnInRequest) => Promise<boolean> {
  return async (r) => {
    const name = `the ${r.kind} burn-in (${r.design})`
    if (
      r.frame.width !== RECORDING_SIZE.width ||
      r.frame.height !== RECORDING_SIZE.height
    ) {
      report(
        `${name}: burn-ins are drawn for 1080x1920, not ${r.frame.width}x${r.frame.height}`
      )
      return false
    }
    const loaded = await load(page, r)
    if (!loaded.ok) {
      for (const p of loaded.problems) report(p)
      return false
    }
    const out = resolve(root, r.out)
    await mkdir(dirname(out), { recursive: true })
    const fps = r.frame.fps
    const ffmpeg = spawn(
      "ffmpeg",
      [
        ...["-hide_banner", "-loglevel", "error", "-nostdin", "-y"],
        ...["-f", "image2pipe", "-c:v", "png", "-framerate", String(fps)],
        ...["-i", "pipe:0", "-frames:v", String(r.frames)],
        ...["-c:v", "png", "-pix_fmt", "rgba", "-fflags", "+bitexact"],
        out,
      ],
      { stdio: ["pipe", "ignore", "pipe"] }
    )
    let stderr = ""
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    // ffmpeg missing, or gone early (a bad path, a full disk): say so rather
    // than crash on the spawn error or wait forever for a pipe to drain.
    const ffmpegState = { closed: false }
    const exited = new Promise<number | null>((done) => {
      ffmpeg.on("error", (e) => {
        stderr ||= e.message
        done(null)
      })
      ffmpeg.on("close", (code) => done(code))
    }).finally(() => {
      ffmpegState.closed = true
    })
    ffmpeg.stdin.on("error", () => {
      // Ignored: an early exit breaks the pipe; `exited` reports it.
    })
    let shown: string | null = null
    let picture: Buffer | null = null
    for (let f = 0; f < r.frames && !ffmpegState.closed; f++) {
      const key = await seek(page, (f * 1000) / fps)
      if (key !== shown || picture === null) {
        picture = await page.screenshot({
          omitBackground: true,
          clip: { x: 0, y: 0, ...RECORDING_SIZE },
        })
        shown = key
      }
      if (!ffmpeg.stdin.write(picture))
        await Promise.race([once(ffmpeg.stdin, "drain"), exited])
    }
    ffmpeg.stdin.end()
    const code = await exited
    if (code !== 0) {
      report(`${name}: ffmpeg could not write ${r.out}: ${stderr.trim()}`)
      return false
    }
    return true
  }
}

/**
 * Renders `<root>/cut-list.json` under `seriesFile` with its burn-ins
 * recorded on `page` (`openRecorder` opened it); a refusal carries the
 * recorder's reasons after the renderer's.
 */
export async function renderWithBurnIns(
  page: Page,
  root: string,
  seriesFile: string,
  options: RenderOptions
): Promise<Rendered> {
  const reasons: Array<string> = []
  const done = await renderFolder(root, seriesFile, {
    ...options,
    recordBurnIn: burnInRecorder(page, root, (line) => reasons.push(line)),
  })
  return done.ok
    ? done
    : { ok: false, problems: [...done.problems, ...reasons] }
}
