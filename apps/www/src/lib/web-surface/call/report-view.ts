import { assertNever } from "@some-ui/core-utils"
import {
  movedMost,
  parseReport,
  reportIntroRows,
  reportPages,
  reportProblems,
  reportScenes,
  takenLines,
} from "@some-ui/video-render"
import type {
  EngagementReport,
  Parsed,
  ReportLineOf,
  ReportPage,
  ReportScene,
} from "@some-ui/video-render"

import { REPORT_WORDS as W } from "./report-words"

/**
 * Which scene of an engagement report the stage shows, and what it draws: a
 * pure read of the report, so the stage only renders it. An unknown scene id
 * shows the first scene, so a mistyped link opens the report from its start.
 */

type ReportView =
  | { readonly section: "brand-in" | "brand-out" }
  | {
      readonly section: "intro"
      readonly rows: ReturnType<typeof reportIntroRows>["rows"]
    }
  | {
      readonly section: "overview"
      readonly wings: ReadonlyArray<{
        readonly name: string
        readonly lines: number
        readonly taken: number
      }>
    }
  | {
      readonly section: "chapter"
      readonly title: string
      /** For a wing's chapter: how many pipelines it shows. */
      readonly pipelines?: number
    }
  | { readonly section: "pipeline"; readonly page: ReportPage }
  | { readonly section: "moved"; readonly line: ReportLineOf | null }

export type ReportAt = {
  readonly scenes: ReadonlyArray<ReportScene>
  readonly index: number
  readonly scene: ReportScene
  readonly view: ReportView
}

/** The line `report.moved` names: the writer's `movedMost` of its lines. */
function movedLine(report: EngagementReport): ReportLineOf | null {
  if (report.moved === null) return null
  const lines = report.wings.flatMap((wing) => wing.lines)
  const moved = movedMost(lines)
  return lines.find((line) => line.id === moved?.id) ?? null
}

function viewOf(
  report: EngagementReport,
  scene: ReportScene,
  sample: boolean
): ReportView {
  switch (scene.section) {
    case "brand-in":
    case "brand-out": {
      return { section: scene.section }
    }
    case "intro": {
      return { section: "intro", rows: reportIntroRows(report, sample).rows }
    }
    case "overview": {
      return {
        section: "overview",
        wings: report.wings.map((wing) => ({
          name: wing.name,
          lines: wing.lines.length,
          taken: takenLines(wing.lines),
        })),
      }
    }
    case "chapter": {
      const { wing } = scene
      return {
        section: "chapter",
        title: scene.title,
        ...(wing === undefined
          ? {}
          : {
              pipelines: new Set(
                report.wings[wing]?.lines.map((line) => line.pipeline)
              ).size,
            }),
      }
    }
    case "pipeline": {
      const page = reportPages(report).at(scene.page)
      if (page === undefined) throw new Error(`no table ${scene.id}`)
      return { section: "pipeline", page }
    }
    case "moved": {
      return { section: "moved", line: movedLine(report) }
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** Scene `id` of the report, or its first scene when it has none by that id. */
export function reportAt(
  report: EngagementReport,
  id: string | undefined,
  sample: boolean
): ReportAt {
  const scenes = reportScenes(report)
  const index = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === id)
  )
  // `reportScenes` always gives the intro, the overview and what moved.
  const scene = scenes[index]
  return { scenes, index, scene, view: viewOf(report, scene, sample) }
}

/** What the report's stage draws: a report, nothing yet, or why it can't. */
export type ReportStageState =
  | { readonly kind: "waiting" }
  | {
      readonly kind: "show"
      readonly report: EngagementReport
      readonly sample: boolean
    }
  | { readonly kind: "none"; readonly problems: ReadonlyArray<string> }

/**
 * What the stage draws from its read: with a week named, that week's report
 * as read, or why it can't, never the sample in its place, so a recording of
 * a week fails instead of drawing another; with none, or `sample`, the
 * template's sample. A viewer (the Pages build) is shown the sample whatever
 * week is named, since the stage there has no owner's report to read.
 */
export function reportStageOf(input: {
  readonly week: string | undefined
  readonly viewer: boolean
  /** The named report's file as read, parsed here. */
  readonly read: {
    readonly data: unknown
    readonly pending: boolean
    readonly failed: boolean
  }
  readonly sample: Parsed<EngagementReport>
}): ReportStageState {
  const { week, read } = input
  const shown = (
    parsed: Parsed<EngagementReport>,
    sample: boolean
  ): ReportStageState => {
    if (!parsed.ok) return { kind: "none", problems: parsed.problems }
    const problems = reportProblems(parsed.value)
    return problems.length > 0
      ? { kind: "none", problems }
      : { kind: "show", report: parsed.value, sample }
  }
  if (input.viewer || week === undefined || week === "sample")
    return shown(input.sample, true)
  if (read.pending) return { kind: "waiting" }
  if (read.failed || read.data === undefined)
    return { kind: "none", problems: [W.unread(week)] }
  const parsed = parseReport(read.data)
  if (parsed.ok && parsed.value.week !== week)
    return { kind: "none", problems: [W.otherWeek(week, parsed.value.week)] }
  return shown(parsed, false)
}
