import type { CallIndex } from "@some-ui/video-render"

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
