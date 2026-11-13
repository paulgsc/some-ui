import type { JSX, ReactNode } from "react"
import { assertNever } from "@some-ui/core-utils"
import {
  COUNT_KINDS,
  hasCaptions,
  markThemeOf,
  reportFormat,
  reportPages,
  sampleReport,
} from "@some-ui/video-render"
import type {
  EngagementReport,
  ReportLineOf,
  ReportScene,
} from "@some-ui/video-render"

import { VIEWER_BUILD } from "@/lib/data-mode"

import { reportSource } from "./feed"
import {
  BrandSlide,
  ChapterSlide,
  LockedIntro,
  StageFrame,
  StageRefused,
} from "./frame"
import { STAGE_WORDS as SW } from "./frame-words"
import type { ReportAt } from "./report-view"
import { reportAt, reportStageOf } from "./report-view"
import { REPORT_WORDS as W } from "./report-words"

/**
 * The weekly engagement report's stage (`@some-ui/video-render`'s
 * `engagement-report-video.ts`, ENG12): one scene of a report at a time, in
 * the recording stages' frame (`./frame`), which refuses a scene it
 * can't hold. Each pipeline is a statement table: this week's four counts,
 * and what was taken against last week, a quarter ago and a year ago, as
 * the public-safety rule lets them show.
 *
 * It plays the report of the week `week` names, as home's render worker
 * hands it over (`./feed`'s `reportSource`), or with no week, or `sample`, the template's
 * sample. A viewer of the Pages build is always shown the sample.
 */

export type ReportStageProps = {
  /** The report shown, by its ISO week ("2026-W46"), or "sample". */
  week?: string
  /** The scene shown, by its id; the first when absent or unknown. */
  scene?: string
  record?: boolean
  onScene?: (scene: string) => void
}

const NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  reportFormat().scenes.map((scene) => [scene.id, scene.name])
)

const SAMPLE = sampleReport()

/** What a scene is called, in the frame's header and its scene buttons. */
const labelOf = (scene: ReportScene, report: EngagementReport): string => {
  switch (scene.section) {
    case "intro": {
      return SW.whoMadeThis
    }
    case "brand-in": {
      return SW.brandIn
    }
    case "brand-out": {
      return SW.brandOut
    }
    case "chapter": {
      return W.chapter(scene.title)
    }
    case "overview":
    case "moved": {
      return NAMES[scene.section] ?? ""
    }
    case "pipeline": {
      return pageName(report, scene.page)
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** A table's pipeline, and its part where it has more than one. */
function pageName(report: EngagementReport, index: number): string {
  const page = reportPages(report).at(index)
  if (page === undefined) return ""
  return page.of > 1
    ? `${page.pipeline} · ${W.part(page.page, page.of)}`
    : page.pipeline
}

/** What the frame's header calls the scene. */
const whereOf = (at: ReportAt, report: EngagementReport): string => {
  const scene = at.scene
  const name =
    scene.section === "brand-in" || scene.section === "brand-out"
      ? ""
      : scene.section === "chapter"
        ? scene.title
        : labelOf(scene, report)
  return [name, `${at.index + 1}/${at.scenes.length}`]
    .filter(Boolean)
    .join(" · ")
}

/** A scene's panel: what it is, and its content. */
const Panel = ({
  tag,
  children,
}: {
  tag: string
  children: ReactNode
}): JSX.Element => (
  <div className="border-border bg-background/60 min-h-full space-y-[0.6em] rounded-[0.6em] border px-[1.4em] py-[1em]">
    <p className="text-primary text-[0.7em] tracking-wide uppercase">{tag}</p>
    {children}
  </div>
)

const Title = ({ children }: { children: ReactNode }): JSX.Element => (
  <p className="text-[1.4em] leading-tight font-bold">{children}</p>
)

const WAY_CLASS: Readonly<Record<string, string>> = {
  up: "text-primary font-semibold",
  down: "text-destructive font-semibold",
  flat: "text-foreground",
  unknown: "text-muted-foreground",
}

const AGAINST = ["last", "quarter", "year"] as const

/** One pipeline's lines as a statement table. */
const Statement = ({
  lines,
}: {
  lines: ReadonlyArray<ReportLineOf>
}): JSX.Element => (
  <table className="w-full table-fixed text-left text-[0.66em]">
    <thead className="text-muted-foreground text-[0.85em]">
      <tr>
        <th className="w-[32%]" />
        <th colSpan={COUNT_KINDS.length} className="font-normal">
          {W.thisWeek}
        </th>
        <th colSpan={AGAINST.length} className="font-normal">
          {W.takenAgainst}
        </th>
      </tr>
      <tr>
        <th className="font-normal">{W.line}</th>
        {COUNT_KINDS.map((kind) => (
          <th key={kind} className="font-normal">
            {W.kind[kind]}
          </th>
        ))}
        {AGAINST.map((against) => (
          <th key={against} className="font-normal">
            {W.against[against]}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {lines.map((line) => (
        <tr
          key={line.id}
          data-line={line.id}
          data-quiet={line.quiet ? "true" : undefined}
          className={
            line.quiet
              ? "border-border text-muted-foreground h-[1.8em] border-t"
              : "border-border h-[1.8em] border-t"
          }
        >
          {/* A quiet line is dimmed: every cell of it already reads "< 5". */}
          <th className="pr-[0.6em] font-semibold">{line.name}</th>
          {COUNT_KINDS.map((kind) => (
            <td
              key={kind}
              className={
                typeof line.counts[kind].now === "number"
                  ? "font-semibold"
                  : "text-muted-foreground"
              }
            >
              {W.count(line.counts[kind].now)}
            </td>
          ))}
          {AGAINST.map((against) => {
            const change = line.counts.taken[against]
            return (
              <td key={against} className={WAY_CLASS[change.way]}>
                {W.change(change)}
              </td>
            )
          })}
        </tr>
      ))}
    </tbody>
  </table>
)

const Legend = (): JSX.Element => (
  <p className="text-muted-foreground text-[0.55em]">{W.legend}</p>
)

const Screen = ({
  report,
  at,
  sample,
}: {
  report: EngagementReport
  at: ReportAt
  sample: boolean
}): JSX.Element => {
  const view = at.view
  switch (view.section) {
    case "intro": {
      return (
        <LockedIntro
          heading={`${W.title} · ${W.weekOf(report.week, report.from, report.to)}`}
          rows={view.rows}
        />
      )
    }
    case "brand-in":
    case "brand-out": {
      return (
        <BrandSlide
          theme={markThemeOf(reportFormat().shape)}
          line={view.section === "brand-in" ? W.title : SW.source}
        />
      )
    }
    case "chapter": {
      return (
        <ChapterSlide
          title={view.title}
          holds={
            view.pipelines === undefined
              ? undefined
              : W.pipelines(view.pipelines)
          }
        />
      )
    }
    case "overview": {
      return (
        <Panel tag={`${NAMES.overview} · ${W.week(report.week)}`}>
          <Title>
            {sample ? W.sample : W.weekOf(report.week, report.from, report.to)}
          </Title>
          {report.held.now ? (
            <table className="w-full text-left text-[0.9em]">
              <thead className="text-muted-foreground text-[0.75em]">
                <tr>
                  <th className="font-normal">{W.wing}</th>
                  <th className="font-normal">{W.lines}</th>
                  <th className="font-normal">{W.takenFive}</th>
                </tr>
              </thead>
              <tbody>
                {view.wings.map((wing) => (
                  <tr
                    key={wing.name}
                    className="border-border h-[2em] border-t"
                  >
                    <th className="font-semibold">{wing.name}</th>
                    <td>{wing.lines}</td>
                    <td className="text-primary font-semibold">{wing.taken}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground text-[1.1em]">{W.noRecord}</p>
          )}
        </Panel>
      )
    }
    case "pipeline": {
      const { page } = view
      const wing = report.wings[page.wing]?.name ?? ""
      return (
        <Panel
          tag={page.of > 1 ? `${wing} · ${W.part(page.page, page.of)}` : wing}
        >
          <Title>{page.pipeline}</Title>
          <Statement lines={page.lines} />
          <Legend />
        </Panel>
      )
    }
    case "moved": {
      return (
        <Panel tag={NAMES.moved}>
          {view.line === null ? (
            <Title>{W.nothingMoved}</Title>
          ) : (
            <>
              <Title>{view.line.name}</Title>
              <p className="text-muted-foreground text-[0.8em]">
                {view.line.pipeline}
              </p>
              <Statement lines={[view.line]} />
              <Legend />
            </>
          )}
        </Panel>
      )
    }
    default: {
      return assertNever(view)
    }
  }
}

export const ReportStagePage = ({
  week,
  scene,
  record = false,
  onScene,
}: ReportStageProps): JSX.Element | null => {
  const named = !VIEWER_BUILD && week !== undefined && week !== "sample"
  const read = reportSource.useResource(
    ["engagement-report", week],
    week ?? "",
    undefined,
    { enabled: named, retry: false }
  )
  const state = reportStageOf({
    week,
    viewer: VIEWER_BUILD,
    read: { data: read.data, pending: read.isPending, failed: read.isError },
    sample: SAMPLE,
  })
  if (state.kind === "waiting") return null
  if (state.kind === "none")
    return (
      <StageRefused
        reason={state.problems.join("\n")}
        problems={state.problems}
      />
    )
  const { report, sample } = state
  const at = reportAt(report, scene, sample)
  const format = reportFormat()
  return (
    <StageFrame
      record={record}
      scene={at.scene.id}
      measureKey={`${report.week}/${at.scene.id}`}
      data={{ "data-report": record ? JSON.stringify(report) : undefined }}
      theme={format.shape?.theme}
      title={W.title}
      where={
        sample ? `${whereOf(at, report)} · ${W.sample}` : whereOf(at, report)
      }
      captioned={record && hasCaptions(format)}
      said={at.scene.said}
      nav={
        onScene === undefined
          ? undefined
          : {
              scenes: at.scenes.map((s) => ({
                id: s.id,
                label: labelOf(s, report),
              })),
              onScene,
            }
      }
    >
      <Screen report={report} at={at} sample={sample} />
    </StageFrame>
  )
}
