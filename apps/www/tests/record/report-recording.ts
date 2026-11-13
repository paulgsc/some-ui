/**
 * The weekly engagement report's recording (ENG12 step 3, #2700), shared by
 * `record:report` (`./report`) and the template's preview, `record:preview`
 * (`./preview`): the report written from home's answer, the stage's stills,
 * each said in the report's one voice, and the renderer laying them
 * together. `./report`'s header says how.
 */
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Route } from "@playwright/test"
import { PIPELINES } from "@some-ui/engagement"
import {
  hasCaptions,
  parseReport,
  REPORT_VOICE,
  reportChapterMarks,
  reportCutList,
  reportFormat,
  reportProblems,
  reportScenes,
  reportWeek,
  reportWeeksOf,
} from "@some-ui/video-render"
import type { EngagementReport } from "@some-ui/video-render"

import type { CallValues } from "./call-recording"
import { FRAME, SERIES } from "./call-recording"
import { fail, here, launchChromium } from "./command"
import {
  placeBed,
  policyOf,
  recordStills,
  refuseLong,
  renderCut,
  shownFrame,
  siteOf,
} from "./voiced"

/** The stage's read of a report named by its week (`web-surface/report/source`). */
const REPORT_READ = /\/engagement-reports\/[^/?#]+\.json$/

export type ReportValues = Omit<CallValues, "week" | "week-file"> & {
  readonly "report-file"?: string
}

/**
 * The week's report, written from home's answer in `path`
 * (`GET /app-events/weeks/:week`, paulgsc/server#819) with the registry's
 * names (`@some-ui/engagement`'s `PIPELINES`), or every reason it can't be.
 */
async function writtenReport(path: string): Promise<EngagementReport> {
  const weeks = reportWeeksOf(JSON.parse(await readFile(path, "utf8")))
  if (!weeks.ok) fail([`${path} isn't home's weeks:`, ...weeks.problems])
  const report = reportWeek(weeks.value, PIPELINES)
  const problems = reportProblems(report)
  if (problems.length > 0)
    fail([`The report of ${report.week} can't be drawn:`, ...problems])
  return report
}

/** Answers the stage's read of the report from the one written here alone. */
function answer(route: Route, report: EngagementReport): Promise<void> {
  const name = new URL(route.request().url()).pathname.split("/").at(-1)
  if (name !== `${report.week}.json`)
    return route.fulfill({ status: 404, body: "" })
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(report),
  })
}

/**
 * Records and renders the report of `values` into `<out>/<week>/report.mp4`;
 * with `preview`, the template's sample report, cut to its preview into
 * `<out>/preview.mp4`.
 */
export async function recordReport(
  values: ReportValues,
  { preview = false }: { readonly preview?: boolean } = {}
): Promise<void> {
  const policy = policyOf(values)
  if (values.voices !== "kokoro" && values.voices !== "none")
    fail(["--voices is kokoro or none"])
  if (!preview && values["report-file"] === undefined)
    fail(["--report-file names home's weeks for the report"])
  const written = preview
    ? null
    : await writtenReport(here(values["report-file"] ?? ""))
  const week = written?.week ?? "sample"
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    const page = await browser.newPage({
      viewport: FRAME,
      deviceScaleFactor: 1,
    })
    if (written)
      await page.route(REPORT_READ, (route) => answer(route, written))
    const url = (scene: string): string =>
      `${site.origin}/report?${new URLSearchParams({ week, scene, record: "true" }).toString()}`

    await page.goto(url("intro"))
    const frame = await shownFrame(page, "[data-scene]")
    const published = await frame.getAttribute("data-report")
    if (published === null) fail(["the stage published no report"])
    const parsed = parseReport(JSON.parse(published))
    if (!parsed.ok)
      fail(["The stage's report can't make a video:", ...parsed.problems])
    const report = parsed.value
    if (written && JSON.stringify(report) !== JSON.stringify(written))
      fail([`the stage played another report than ${written.week}'s`])

    const scenes = reportScenes(report)
    if (!preview) refuseLong(scenes, policy)
    const root = here(preview ? values.out : join(values.out, report.week))
    const format = reportFormat()
    const takes = await recordStills({
      page,
      root,
      shots: scenes.map((scene) => ({
        id: scene.id,
        url: url(scene.id),
        said: scene.said,
        voice: REPORT_VOICE,
      })),
      frame: (id) => `[data-scene="${id}"]`,
      speaker: values.voices === "kokoro" ? values.speaker : null,
      timed: hasCaptions(format),
      policy,
    })
    const bed = await placeBed(
      SERIES,
      format.series.version,
      values.brand,
      root
    )
    await writeFile(
      join(root, "report.json"),
      `${JSON.stringify(report, null, 1)}\n`
    )
    await renderCut(root, SERIES, reportCutList(report, takes, { bed }), {
      preview,
      episode: "report.mp4",
      marks: () => reportChapterMarks(report),
      policy,
      browser,
      origin: site.origin,
    })
  } finally {
    await browser.close()
    await site.close()
  }
}
