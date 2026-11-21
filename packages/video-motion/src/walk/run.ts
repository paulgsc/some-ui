/**
 * A scripted walk of an app, replayed on a stage that holds only sample data
 * (SFEED7, the smallest part; WALK1, #3282), driven by Playwright step by
 * step. Each step's screen is kept as a still (a snip), and each tap as where
 * it landed and when, on the walk's own timeline, never the clock's: a walk's
 * snips and `walk.json` are a function of the app's build and the sample, on
 * one machine.
 *
 * One runner, two stages (C860): the same steps and the same `walk.json`,
 * whether the app is a built web page in a sandbox (`./stage-sandbox`) or the
 * APK on an emulator (`./stage-apk`). A new stage is a new case of `StageSpec`
 * and of `openStage`'s switch, never a second runner. What a step does is a
 * closed union too (`Action`), each case handled once here.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { assertNever } from "@some-ui/core-utils"
import type { Page } from "playwright-core"

import type { Microphone } from "./microphone"
import { microphoneScript } from "./microphone"
import type { ApkStageSpec } from "./stage-apk"
import { openApkStage } from "./stage-apk"
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

/** One step: its action, then the screen it leaves, held `holdMs` on the walk's timeline. */
export type Step = {
  readonly label: string
  readonly action: Action
  /** A selector to see before the screen is taken: what the step is waiting for. */
  readonly until?: string
  readonly holdMs: number
}

/** Where the walk is played: a closed union, one case per stage. */
type StageSpec = SandboxStageSpec | ApkStageSpec

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
  /** Opens the walk's first page, with `init` run before the page's own scripts. */
  readonly open: (init: ReadonlyArray<string>) => Promise<void>
  /** The page held still, ready to be taken. */
  readonly settle: () => Promise<void>
  /** The whole snip, written to `path`. */
  readonly shoot: (path: string) => Promise<void>
  /** Why the screen is not the app's, if it is not (a script error, a request refused). */
  readonly problems: () => ReadonlyArray<string>
  readonly close: () => Promise<void>
}

/** What a walk leaves beside its snips, as `walk.json` (`some-ui.walk/1`). */
export type WalkFile = {
  readonly schema: "some-ui.walk/1"
  readonly app: string
  readonly version: string
  readonly viewport: WalkViewport
  /** Each step's screen, from `atMs` until the next one starts. */
  readonly snips: ReadonlyArray<{
    readonly file: string
    readonly label: string
    readonly atMs: number
  }>
  /** Each tap: when, and where in the snip before it, in the viewport's units. */
  readonly taps: ReadonlyArray<{
    readonly label: string
    readonly atMs: number
    readonly x: number
    readonly y: number
  }>
  readonly lengthMs: number
}

/** How long before a step's screen its tap lands, so the ring is seen first. */
const TAP_LEAD_MS = 400

/** How long a step may wait for what it is waiting for. */
const UNTIL_MS = 20_000

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
    await stage.shoot(join(out, "failed.png"))
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
  const stage = await openStage(walk.stage, chrome)
  try {
    await stage.open(
      walk.microphone === undefined ? [] : [microphoneScript(walk.microphone)]
    )
    await stage.settle()

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
        await stage.shoot(join(out, file))
        snips.push({ file, label: step.label, atMs })
        atMs += step.holdMs
      } catch (e) {
        await leftAt(stage, out, step.label)
        throw e
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
