import { assertNever } from "@some-ui/core-utils"
import { callScenes, parseCallWeek } from "@some-ui/video-render"
import type { CallScene, CallWeek, Parsed } from "@some-ui/video-render"

/**
 * Which scene of a call the stage shows, and the item it draws: a pure read
 * of the week's data, so the stage only renders it. An unknown scene id
 * shows the first scene, so a mistyped link opens the call from its start.
 */

type Item<K extends "moved" | "done" | "gray" | "mine" | "asks"> =
  CallWeek[K][number]

export type SceneView =
  | { readonly section: "open" | "board" | "close" }
  | { readonly section: "moved"; readonly item: Item<"moved"> }
  | { readonly section: "done"; readonly item: Item<"done"> }
  | { readonly section: "gray"; readonly item: Item<"gray"> }
  | { readonly section: "mine"; readonly item: Item<"mine"> }
  | { readonly section: "asks"; readonly item: Item<"asks"> }

export type CallAt = {
  readonly scenes: ReadonlyArray<CallScene>
  readonly index: number
  readonly scene: CallScene
  readonly view: SceneView
}

const find = <T extends { readonly id: string }>(
  list: ReadonlyArray<T>,
  id: string | undefined
): T => {
  const found = list.find((item) => item.id === id)
  if (found === undefined) throw new Error(`no item ${String(id)}`)
  return found
}

function viewOf(week: CallWeek, scene: CallScene): SceneView {
  switch (scene.section) {
    case "open":
    case "board":
    case "close": {
      return { section: scene.section }
    }
    case "moved": {
      return { section: "moved", item: find(week.moved, scene.item) }
    }
    case "done": {
      return { section: "done", item: find(week.done, scene.item) }
    }
    case "gray": {
      return { section: "gray", item: find(week.gray, scene.item) }
    }
    case "mine": {
      return { section: "mine", item: find(week.mine, scene.item) }
    }
    case "asks": {
      return { section: "asks", item: find(week.asks, scene.item) }
    }
    default: {
      return assertNever(scene.section)
    }
  }
}

/** Scene `id` of the call, or its first scene when it has none by that id. */
export function callAt(week: CallWeek, id: string | undefined): CallAt {
  const scenes = callScenes(week)
  const index = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === id)
  )
  // `callScenes` always gives the open, the board and the close.
  const scene = scenes[index]
  return { scenes, index, scene, view: viewOf(week, scene) }
}

/** The weeks the call has, newest first, and why any file isn't one. */
export type CallWeeks = {
  readonly weeks: ReadonlyArray<CallWeek>
  readonly problems: ReadonlyArray<string>
}

/**
 * The weeks under `weeks/`, by file: each `<from>.json` a week whose data
 * starts on that day. A file that can't make a call, or is named for
 * another day, is left out and said.
 */
export function weeksOf(files: Readonly<Record<string, unknown>>): CallWeeks {
  const weeks: Array<CallWeek> = []
  const problems: Array<string> = []
  for (const [path, raw] of Object.entries(files)) {
    const name = path.split("/").pop() ?? path
    const week = parseCallWeek(raw)
    if (!week.ok) {
      problems.push(...week.problems.map((p) => `${name}: ${p}`))
      continue
    }
    if (name !== `${week.value.week.from}.json`) {
      problems.push(`${name}: it holds the week of ${week.value.week.from}`)
      continue
    }
    weeks.push(week.value)
  }
  weeks.sort((a, b) => b.week.from.localeCompare(a.week.from))
  return { weeks, problems }
}

/** The week the stage shows: the one named, else the newest, else the sample. */
export function weekAt(
  weeks: CallWeeks,
  sample: Parsed<CallWeek>,
  from: string | undefined
): { readonly week: CallWeek; readonly sample: boolean } | null {
  const named =
    from === "sample"
      ? undefined
      : weeks.weeks.find((w) => w.week.from === from)
  const real = named ?? (from === "sample" ? undefined : weeks.weeks[0])
  if (real !== undefined) return { week: real, sample: false }
  return sample.ok ? { week: sample.value, sample: true } : null
}
