import { createDataSource } from "@some-ui/fetch-kit"
import type { DataSource } from "@some-ui/fetch-kit"
import { TESTING_DATA } from "@some-ui/video-render"

import { DATA_MODE } from "@/lib/data-mode"
import { PUBLIC_READ } from "@/lib/file-host-config"

/**
 * What `paulgsc/testing` publishes for the web's stages (Playoff Delta's
 * season, the weekly call's weeks), served with
 * `Access-Control-Allow-Origin: *`, so a stage reads it directly where its
 * build reads content. Its base is video-render's, which Studio's Library
 * on the phone reads clips from too.
 */
export { TESTING_DATA }

/** A JSON file of `paulgsc/testing`'s, located by `locate`, read publicly. */
export const testingSource = <TParams, TData>(
  locate: (params: TParams) => URL
): DataSource<TParams, TData> =>
  createDataSource<TParams, TData>(
    { static: locate, server: locate },
    { mode: DATA_MODE, fetchOptions: { ...PUBLIC_READ, responseAs: "json" } }
  )
