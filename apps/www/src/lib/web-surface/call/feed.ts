import { createDataSource } from "@some-ui/fetch-kit"
import type { CallIndex, CallWeek } from "@some-ui/video-render"

import { DATA_MODE } from "@/lib/data-mode"
import { PUBLIC_READ } from "@/lib/file-host-config"

/**
 * Where the call's weeks live (ST36): `paulgsc/testing`, beside Playoff
 * Delta's data, served with `Access-Control-Allow-Origin: *`. The index
 * lists the weeks the repository keeps; older weeks are home's alone.
 */
const CALL_DATA = "https://raw.githubusercontent.com/paulgsc/testing/main/call"

const locateIndex = (): URL => new URL(`${CALL_DATA}/index.json`)

const locateWeek = (from: string): URL => new URL(`${CALL_DATA}/${from}.json`)

const read = {
  mode: DATA_MODE,
  fetchOptions: { ...PUBLIC_READ, responseAs: "json" },
} as const

export const indexSource = createDataSource<undefined, CallIndex>(
  { static: locateIndex, server: locateIndex },
  read
)

export const weekSource = createDataSource<string, CallWeek>(
  { static: locateWeek, server: locateWeek },
  read
)
