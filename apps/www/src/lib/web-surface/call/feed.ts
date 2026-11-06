import type { CallIndex, CallWeek } from "@some-ui/video-render"

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

export const weekSource = testingSource<string, CallWeek>(
  (from) => new URL(`${CALL_DATA}/${from}.json`)
)
