import { assertNever } from "@some-ui/core-utils"
import {
  CALL_CHAPTERS,
  callIntro,
  callScenes,
  parseCallWeek,
} from "@some-ui/video-render"
import type {
  CallIndex,
  CallScene,
  CallWeek,
  Parsed,
} from "@some-ui/video-render"

/**
 * Which scene of a call the stage shows, and the item it draws: a pure read
 * of the week's data, so the stage only renders it. An unknown scene id
 * shows the first scene, so a mistyped link opens the call from its start.
 */

type Item<K extends "moved" | "done" | "gray" | "mine" | "asks"> =
  CallWeek[K][number]

export type SceneView =
  | { readonly section: "open" | "board" | "close" | "brand-in" | "brand-out" }
  | {
      readonly section: "intro"
      readonly rows: ReturnType<typeof callIntro>["rows"]
    }
  | {
      readonly section: "chapter"
      readonly title: string
      /** How many scenes the section has: its items, or none for one scene. */
      readonly items: number
    }
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

function viewOf(
  week: CallWeek,
  scene: CallScene,
  scenes: ReadonlyArray<CallScene>
): SceneView {
  switch (scene.section) {
    case "open":
    case "board":
    case "close":
    case "brand-in":
    case "brand-out": {
      return { section: scene.section }
    }
    case "intro": {
      return { section: "intro", rows: callIntro(week).rows }
    }
    case "chapter": {
      const items = scenes.filter(
        (s) => s.section === scene.of && "item" in s && s.item !== undefined
      ).length
      return { section: "chapter", title: CALL_CHAPTERS[scene.of], items }
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
      return assertNever(scene)
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
  return { scenes, index, scene, view: viewOf(week, scene, scenes) }
}

/**
 * Which week of the index the stage asks for: the one named, else the
 * newest; none for "sample", or before the index is read. `missing` says a
 * week was named that the index doesn't keep.
 */
export function weekFrom(
  index: CallIndex | undefined,
  from: string | undefined
): { readonly from: string | null; readonly missing: boolean } {
  if (from === "sample" || index === undefined)
    return { from: null, missing: false }
  if (from !== undefined && index.weeks.some((w) => w.from === from))
    return { from, missing: false }
  return {
    from: index.weeks.at(0)?.from ?? null,
    missing: from !== undefined,
  }
}

/** A read the stage waits on: its data once there, and whether it's under way. */
export type Read<T> = {
  readonly data: T | undefined
  readonly pending: boolean
}

/** What the stage draws. */
export type StageState =
  /** Nothing yet: the live week is being read. */
  | { readonly kind: "waiting" }
  /** Nothing, on record: the live week couldn't be read, and the sample must not be recorded. */
  | { readonly kind: "blank" }
  | {
      readonly kind: "show"
      readonly week: CallWeek
      readonly sample: boolean
      /** A week was named that the index doesn't keep. */
      readonly missing: boolean
      /** The live week was wanted and couldn't be read, so the sample shows. */
      readonly unread: boolean
      /** Why the live week couldn't make a call, when it was read. */
      readonly problems: ReadonlyArray<string>
    }
  /** Nothing to show at all: the sample itself can't make a call. */
  | { readonly kind: "none"; readonly problems: ReadonlyArray<string> }

/**
 * What the stage draws from its reads: the live week where the build reads
 * content, else the sample, saying why. On record, never the sample in place
 * of a live week.
 */
export function stageOf(input: {
  readonly reads: boolean
  readonly record: boolean
  readonly from: string | undefined
  readonly index: Read<CallIndex>
  readonly week: Read<CallWeek>
  readonly sample: Parsed<CallWeek>
}): StageState {
  const live = input.reads && input.from !== "sample"
  const pick = weekFrom(input.index.data, input.from)
  if (
    live &&
    (input.index.pending || (pick.from !== null && input.week.pending))
  )
    return { kind: "waiting" }
  const real =
    !live || input.week.data === undefined
      ? null
      : parseCallWeek(input.week.data)
  if (real?.ok === true)
    return {
      kind: "show",
      week: real.value,
      sample: false,
      missing: pick.missing,
      unread: false,
      problems: [],
    }
  // An index that keeps no week yet is nothing to read, not a failed read.
  const empty = input.index.data?.weeks.length === 0
  const unread = live && !empty
  if (input.record && unread) return { kind: "blank" }
  const problems = real?.ok === false ? real.problems : []
  if (!input.sample.ok)
    return { kind: "none", problems: [...problems, ...input.sample.problems] }
  return {
    kind: "show",
    week: input.sample.value,
    sample: true,
    missing: pick.missing,
    unread,
    problems,
  }
}
