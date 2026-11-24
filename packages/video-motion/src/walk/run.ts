/**
 * A scripted walk of an app, replayed on a stage that holds only sample data
 * (SFEED7, the smallest part; WALK1, #3282), driven by Playwright step by
 * step. Each step's screen is kept as a still (a snip), and each tap as where
 * it landed and when, on the walk's own timeline, never the clock's: a walk's
 * snips and `walk.json` are a function of the app's build and the sample, on
 * one machine.
 *
 * One runner, three stages (C860, C1431): the same steps and the same
 * `walk.json`, whether the app is a built web page in a sandbox
 * (`./stage-sandbox`), the APK on an emulator (`./stage-apk`) or a throwaway
 * Grafana (`./stage-grafana`). A new stage is a new case of `StageSpec`
 * and of `openStage`'s switch, never a second runner. What a step does is a
 * closed union too (`Action`), each case handled once here.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { assertNever } from "@some-ui/core-utils"
import type { WalkFile } from "@some-ui/video-render"
import type { Page } from "playwright-core"

import type { Microphone } from "./microphone"
import { microphoneScript } from "./microphone"
import type { ApkStageSpec } from "./stage-apk"
import { openApkStage, WebViewNotLaidOut } from "./stage-apk"
import type { GrafanaStageSpec } from "./stage-grafana"
import { openGrafanaStage } from "./stage-grafana"
import type { SandboxStageSpec } from "./stage-sandbox"
import { openSandboxStage } from "./stage-sandbox"

/** What a step does before its screen is taken. */
type Action =
  /** The first step: the screen the walk opens on. */
  | { readonly kind: "open" }
  /** Tap a control, a Playwright selector; `reopen` loads the page again after, as reopening a popup does. */
  | { readonly kind: "tap"; readonly target: string; readonly reopen?: true }
  /** Type into a field, which is tapped first, as a person would. */
  | { readonly kind: "type"; readonly target: string; readonly text: string }
  /** Hold on the screen for a while of real time (a take recording), shown once it has passed. */
  | { readonly kind: "dwell"; readonly ms: number }
  /** Go to another page of the stage's own origin, a path and query (a dashboard's next panel). */
  | { readonly kind: "visit"; readonly path: string }

/** One step: its action, then the screen it leaves, held `holdMs` on the walk's timeline. */
export type Step = {
  readonly label: string
  readonly action: Action
  /** A selector to see before the screen is taken: what the step is waiting for. */
  readonly until?: string
  /** The screen moves by nature (a take recording, a level ring): take it as it is, without waiting for it to hold still. */
  readonly moving?: true
  readonly holdMs: number
}

/** Where the walk is played: a closed union, one case per stage. */
type StageSpec = SandboxStageSpec | ApkStageSpec | GrafanaStageSpec

export type Walk = {
  readonly app: string
  readonly stage: StageSpec
  /** A microphone the page is given in place of the device's (WALK3). */
  readonly microphone?: Microphone
  readonly steps: ReadonlyArray<Step>
}

/** The viewport a walk's places are in: CSS px, each `scale` px of a snip. */
export type WalkViewport = {
  readonly width: number
  readonly height: number
  readonly scale: number
}

/**
 * A stage, open: the page the steps drive, and how its screen is taken.
 * Opened by `openStage`, closed by the runner.
 */
export type Stage = {
  readonly page: Page
  /** The app's version, as its build says. */
  readonly version: string
  /** The snips' size, in `place`'s units. */
  readonly viewport: WalkViewport
  /** Where a point of the page (CSS px) is on the snip, in the viewport's units. */
  readonly place: (x: number, y: number) => { x: number; y: number }
  /** The origin a `visit` goes to: the stage's own pages, never another's. */
  readonly origin: string
  /** Opens the walk's first page, with `init` run before the page's own scripts. */
  readonly open: (init: ReadonlyArray<string>) => Promise<void>
  /** The page held still, ready to be taken. */
  readonly settle: () => Promise<void>
  /** The whole snip, written to `path`; once still, unless the screen is `moving`. */
  readonly shoot: (path: string, moving: boolean) => Promise<void>
  /** Why the screen is not the app's, if it is not (a script error, a request refused). */
  readonly problems: () => ReadonlyArray<string>
  readonly close: () => Promise<void>
}

/** What a walk leaves beside its snips, as `walk.json`: `@some-ui/video-render`'s, which a cards essay plays too. */
export { WalkFileSchema } from "@some-ui/video-render"
export type { WalkFile } from "@some-ui/video-render"

/** How long before a step's screen its tap lands, so the ring is seen first. */
const TAP_LEAD_MS = 400

/** How long a step may wait for what it is waiting for. */
const UNTIL_MS = 20_000

/** A made-up origin a visit's path is resolved against, to see it stays there. */
const ANY_STAGE = "http://stage.invalid"

/**
 * A path of the stage's own origin, as the URL parser reads it: `//host`,
 * `/\\host` and a tab or newline inside all leave the origin, so the parsed
 * origin is what is checked, never the text.
 */
function onStage(path: string): boolean {
  if (!path.startsWith("/")) return false
  try {
    return new URL(path, ANY_STAGE).origin === ANY_STAGE
  } catch {
    return false
  }
}

/** Every reason `steps` can't be walked, before anything is opened. */
export function stepProblems(
  steps: ReadonlyArray<Step>
): ReadonlyArray<string> {
  const problems: Array<string> = []
  if (steps.length === 0) problems.push("the walk has no steps")
  steps.forEach((step, i) => {
    const opens = step.action.kind === "open"
    if (i === 0 && !opens) problems.push(`${step.label}: the first step opens`)
    if (i > 0 && opens)
      problems.push(`${step.label}: only the first step opens`)
    if (step.holdMs <= 0) problems.push(`${step.label}: it is held no time`)
    if (step.action.kind === "dwell" && step.action.ms <= 0) {
      problems.push(`${step.label}: it dwells no time`)
    }
    if (step.action.kind === "visit" && !onStage(step.action.path)) {
      problems.push(`${step.label}: it visits a path of the stage, from /`)
    }
  })
  return problems
}

/** The stage `spec` names, open; `chrome` is asked for only by a stage that draws with its own browser. */
function openStage(spec: StageSpec, chrome: () => string): Promise<Stage> {
  switch (spec.kind) {
    case "sandbox": {
      return openSandboxStage(spec, chrome())
    }
    case "apk": {
      return openApkStage(spec)
    }
    case "grafana": {
      return openGrafanaStage(spec, chrome())
    }
    default: {
      return assertNever(spec)
    }
  }
}

/** Where the centre of `target` is on the snip, or a refusal naming the step. */
async function centreOf(
  stage: Stage,
  label: string,
  target: string
): Promise<{ x: number; y: number }> {
  const box = await stage.page.locator(target).first().boundingBox()
  if (!box) throw new Error(`${label}: ${target} is not on screen`)
  const at = stage.place(box.x + box.width / 2, box.y + box.height / 2)
  return { x: Math.round(at.x), y: Math.round(at.y) }
}

/** Does `action` on the stage's page; the tap it shows, if any. */
async function act(
  stage: Stage,
  label: string,
  action: Action
): Promise<{ x: number; y: number } | null> {
  const { page } = stage
  switch (action.kind) {
    case "open": {
      return null
    }
    case "tap": {
      const at = await centreOf(stage, label, action.target)
      await page.locator(action.target).first().click()
      if (action.reopen) await page.reload()
      return at
    }
    case "type": {
      const at = await centreOf(stage, label, action.target)
      const field = page.locator(action.target).first()
      await field.click()
      await field.pressSequentially(action.text)
      return at
    }
    case "dwell": {
      await page.waitForTimeout(action.ms)
      return null
    }
    case "visit": {
      // A path of the stage's own origin (`stepProblems` refused any other),
      // resolved against the stage, never the page, which may have moved.
      const to = new URL(action.path, stage.origin)
      if (to.origin !== new URL(stage.origin).origin) {
        throw new Error(`${label}: ${action.path} leaves the stage`)
      }
      await page.goto(to.toString())
      return null
    }
    default: {
      return assertNever(action)
    }
  }
}

/**
 * What was on screen when a step failed, for reading the failure: the
 * picture as `failed.png` and the page's words as `failed.txt`, beside the
 * snips. Best effort: a stage too broken to answer leaves neither.
 */
async function leftAt(stage: Stage, out: string, label: string): Promise<void> {
  try {
    await stage.shoot(join(out, "failed.png"), true)
    const words = String(
      await stage.page.evaluate("document.body ? document.body.innerText : ''")
    )
    await writeFile(join(out, "failed.txt"), `${label}\n\n${words}\n`)
  } catch {
    // Ignored: what was on screen is extra; the step's own error, which the
    // walk throws next, is the failure.
  }
}

/** Replays `walk` on its stage, writing its snips and `walk.json` to `out`. */
export async function runWalk(
  walk: Walk,
  chrome: () => string,
  out: string
): Promise<WalkFile> {
  const refused = stepProblems(walk.steps)
  if (refused.length > 0) throw new Error(refused.join("; "))
  await mkdir(join(out, "snips"), { recursive: true })
  const stage = await openStage(walk.stage, chrome).catch(
    async (e: unknown): Promise<never> => {
      // The screen as the stage last saw it (WALK9, #3489), the failure's
      // evidence: no page is open yet to leave failed.png from.
      if (e instanceof WebViewNotLaidOut) {
        await writeFile(join(out, "failed-ui.xml"), e.dump)
      }
      throw e
    }
  )
  try {
    // The first step's page: a failure opening it is that step's too.
    const first = walk.steps[0]?.label ?? walk.app
    try {
      await stage.open(
        walk.microphone === undefined ? [] : [microphoneScript(walk.microphone)]
      )
      await stage.settle()
    } catch (e) {
      await leftAt(stage, out, first)
      const said = e instanceof Error ? e.message : String(e)
      throw new Error(`${first}: ${said}`, { cause: e })
    }

    const snips: Array<WalkFile["snips"][number]> = []
    const taps: Array<WalkFile["taps"][number]> = []
    let atMs = 0
    for (const [i, step] of walk.steps.entries()) {
      try {
        const tapped = await act(stage, step.label, step.action)
        if (tapped) {
          taps.push({ label: step.label, atMs: atMs - TAP_LEAD_MS, ...tapped })
        }
        if (step.until !== undefined) {
          await stage.page
            .locator(step.until)
            .first()
            .waitFor({ state: "visible", timeout: UNTIL_MS })
        }
        await stage.settle()
        const problems = stage.problems()
        if (problems.length > 0) {
          throw new Error(
            `${step.label}: the page failed: ${problems.join("; ")}`
          )
        }
        const file = `snips/${String(i + 1).padStart(2, "0")}.png`
        await stage.shoot(join(out, file), step.moving === true)
        snips.push({ file, label: step.label, atMs })
        atMs += step.holdMs
      } catch (e) {
        await leftAt(stage, out, step.label)
        // Every failure names its step, whichever part of it failed.
        const said = e instanceof Error ? e.message : String(e)
        throw said.startsWith(`${step.label}: `)
          ? e
          : new Error(`${step.label}: ${said}`, { cause: e })
      }
    }
    const made: WalkFile = {
      schema: "some-ui.walk/1",
      app: walk.app,
      version: stage.version,
      viewport: stage.viewport,
      snips,
      taps,
      lengthMs: atMs,
    }
    await writeFile(
      join(out, "walk.json"),
      `${JSON.stringify(made, null, 1)}\n`
    )
    return made
  } finally {
    await stage.close()
  }
}
