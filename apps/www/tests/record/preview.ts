/**
 * Records and renders a template's preview (SFEED12, #2757): the template's
 * sample, said and drawn the way an episode is, then cut by code to 15–30 s
 * (`previewOf`) and rendered, titled as a preview of sample data. Home's
 * render worker runs it as its `preview` job (paulgsc/server
 * `infra/render/render-calls.sh`).
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:preview --template conference-call [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/preview]
 *   pnpm --filter www record:preview --app http://call-stage --template conference-call --voices kokoro --brand /brand --out <dir>
 *
 * It writes `<out>/preview.mp4` and `<out>/cut-list.json`, and keeps its
 * stills, takes and step cache in `<out>` as `record:call` does, under the
 * same policy flags; a step past the cache's budget prints a
 * `cache warning:` line, which the worker keeps.
 *
 * The weekly call's sample week is its fill. Playoff Delta's templates have
 * no sample fill in code yet, so a preview of either is refused.
 */

import { parseArgs } from "node:util"
import { isTemplateId } from "@some-ui/video-render"

import { CALL_OPTIONS, recordCall } from "./call-recording"
import { fail, runCommand } from "./command"

const { values } = parseArgs({
  options: {
    template: { type: "string" },
    out: { type: "string", default: "out/preview" },
    ...CALL_OPTIONS,
  },
})

await runCommand(async () => {
  const { template } = values
  if (!isTemplateId(template))
    fail([`--template names a template Studio lists, not ${String(template)}`])
  if (template !== "conference-call")
    fail([`${template} has no sample fill yet, so it can't be previewed`])
  await recordCall({ ...values, week: "sample" }, { preview: true })
})
