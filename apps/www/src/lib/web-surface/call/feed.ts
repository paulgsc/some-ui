import { createDataSource } from "@some-ui/fetch-kit"
import type { DataSource } from "@some-ui/fetch-kit"
import type { CallIndex } from "@some-ui/video-render"

import { DATA_MODE } from "@/lib/data-mode"
import { PUBLIC_READ } from "@/lib/file-host-config"
import { TESTING_DATA, testingSource } from "@/lib/testing-data"

/**
 * Where the call's weeks live (ST36): `paulgsc/testing`'s `call/`, beside
 * Playoff Delta's data. The index lists the weeks the repository keeps;
 * older weeks are home's alone.
 */
const CALL_DATA = `${TESTING_DATA}/call`

export const indexSource = testingSource<undefined, CallIndex>(
  () => new URL(`${CALL_DATA}/index.json`)
)

/**
 * A week's file as read, unchecked: the stage parses it (`stageOf`), so a
 * week it can't draw, one written for a newer template among them (VS1),
 * reaches the frame as its problems rather than as a failed read.
 */
export const weekSource = testingSource<string, unknown>(
  (from) => new URL(`${CALL_DATA}/${from}.json`)
)

/**
 * A file named by its week, read from beside the stage under `folder`,
 * unchecked: the stage parses it. No cookie goes with it (LA4): home's render
 * worker's recorder answers it from the file it was handed, and nothing else
 * serves it to a browser.
 */
function besideStage(folder: string): DataSource<string, unknown> {
  const address = (week: string): URL =>
    new URL(
      `/${folder}/${encodeURIComponent(week)}.json`,
      window.location.origin
    )
  return createDataSource<string, unknown>(
    { static: address, server: address },
    { mode: DATA_MODE, fetchOptions: { ...PUBLIC_READ, responseAs: "json" } }
  )
}

/**
 * An essay, by its week (RR16; `essayStageOf` parses it): beside the stage,
 * never `paulgsc/testing`, since an essay carries the owner's words; the
 * recorder answers it from `record:essay --essay-file`.
 */
export const essaySource = besideStage("rust-essays")

/**
 * An engagement report, by its ISO week (ENG12; `reportStageOf` parses it):
 * the recorder answers it with the report it writes from
 * `record:report --report-file`.
 */
export const reportSource = besideStage("engagement-reports")
