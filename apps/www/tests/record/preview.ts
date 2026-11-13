/**
 * Records and renders a template's preview (SFEED12, #2757): the template's
 * sample, said and drawn the way an episode is, then cut by code to 15–30 s
 * (`previewOf`) and rendered, titled as a preview of sample data. Home's
 * render worker runs it as its `preview` job (paulgsc/server
 * `infra/render/render-calls.sh`).
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:preview --template conference-call [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/preview]
 *   pnpm --filter www record:preview --app http://call-stage --template playoff-delta-week --voices kokoro --brand /brand --out <dir>
 *
 * It writes `<out>/preview.mp4`, `<out>/cut-list.json` and the sample as
 * recorded (the call's week, `<out>/week.json`; Playoff Delta's fill,
 * `<out>/narration.json`), and keeps its stills, takes and step cache in
 * `<out>` as `record:call` does, under the same policy flags; a step past
 * the cache's budget prints a `cache warning:` line, which the worker keeps.
 *
 * Each template's sample is in code: the weekly call's sample week, Playoff
 * Delta's sample season, its legend or its newest week, said from the
 * sample's fill (`sampleFill` in `@some-ui/playoff-delta`), and the Rust
 * Rounds essay's sample essay (`Voicing`), written as `<out>/essay.json`, and
 * the engagement report's sample report, written as `<out>/report.json`.
 */

import { parseArgs } from "node:util"
import { isTemplateId, type TemplateId } from "@some-ui/video-render"

import { CALL_OPTIONS, recordCall, type CallValues } from "./call-recording"
import { fail, runCommand } from "./command"
import { recordEssay } from "./essay-recording"
import { recordPlayoffDelta } from "./playoff-delta-recording"
import { recordReport } from "./report-recording"

const { values } = parseArgs({
  options: {
    template: { type: "string" },
    out: { type: "string", default: "out/preview" },
    ...CALL_OPTIONS,
  },
})

/** Each template's preview, made from its own sample. */
const PREVIEWS: Readonly<
  Record<TemplateId, (values: CallValues) => Promise<void>>
> = {
  "conference-call": (v) => recordCall(v, { preview: true }),
  "engagement-report": (v) => recordReport(v, { preview: true }),
  "playoff-delta-legend": (v) => recordPlayoffDelta(v, { preview: "legend" }),
  "playoff-delta-week": (v) => recordPlayoffDelta(v, { preview: "week" }),
  "rust-essay": (v) => recordEssay(v, { preview: true }),
}

await runCommand(async () => {
  const { template } = values
  if (!isTemplateId(template))
    fail([
      template === undefined
        ? "--template names the template to preview"
        : `--template names a template Studio lists, not ${template}`,
    ])
  await PREVIEWS[template](values)
})
