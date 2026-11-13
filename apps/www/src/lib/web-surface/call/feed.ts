import { createDataSource } from "@some-ui/fetch-kit"
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
 * Where the essay's stage reads an essay named by its week (RR16): beside
 * the stage, never `paulgsc/testing`, since an essay carries the owner's
 * words. Home's render worker answers it from the essay home keeps
 * (`record:essay --essay-file`); nothing else serves it to a browser yet.
 */
const essayAddress = (week: string): URL =>
  new URL(
    `/rust-essays/${encodeURIComponent(week)}.json`,
    window.location.origin
  )

/** An essay's file as read, unchecked: the stage parses it (`essayStageOf`). */
export const essaySource = createDataSource<string, unknown>(
  { static: essayAddress, server: essayAddress },
  {
    mode: DATA_MODE,
    // No cookie goes with it (LA4): the recorder answers it from the file.
    fetchOptions: { ...PUBLIC_READ, responseAs: "json" },
  }
)

/**
 * Where the report's stage reads a report named by its week: beside the
 * stage, as the essay's is. Home's render worker answers it from the report
 * the recorder writes from home's own records (`record:report
 * --report-file`); nothing else serves it to a browser.
 */
const reportAddress = (week: string): URL =>
  new URL(
    `/engagement-reports/${encodeURIComponent(week)}.json`,
    window.location.origin
  )

/** A report's file as read, unchecked: the stage parses it (`reportStageOf`). */
export const reportSource = createDataSource<string, unknown>(
  { static: reportAddress, server: reportAddress },
  {
    mode: DATA_MODE,
    // No cookie goes with it (LA4): the recorder answers it from the file.
    fetchOptions: { ...PUBLIC_READ, responseAs: "json" },
  }
)
