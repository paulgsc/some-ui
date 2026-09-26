/**
 * Where the Topik applet's study material comes from in this app.
 *
 * `@some-ui/topik` ships two repositories that default to plain HTTP against
 * a manifest and one file per lesson, and both factories take a loader
 * precisely so a host can decide where those files actually live (see their
 * factory doc comments). This is that decision for `apps/www`, built on the
 * same `@some-ui/fetch-kit` `createDataSource` that `hangul-vocab` uses for
 * its content:
 *
 * - **`vite dev` / `vite preview` / Docker** (`DATA_MODE === "server"`) -
 *   fetch from `file_host`'s curriculum routes (paulgsc/server#276):
 *   `GET /api/v1/curriculum/manifest.json` and `GET /api/v1/curriculum/:key`,
 *   at the same base every other `file_host` call resolves
 *   (`lib/file-host-config`: the same-origin proxy on an HTTPS page, the
 *   published port on an HTTP one, `VITE_FILE_HOST_ENDPOINT` over both).
 *   A lesson is a row the server owns, so adding one means importing it
 *   (`import-curriculum`, paulgsc/server#275), not symlinking or mounting a
 *   directory into this app's `public/` - both of which are retired
 *   (some-ui#1048). `packages/some-content/public/topiks` is still where
 *   lesson files are authored; it is the importer's input, not something
 *   this app serves.
 * - **GitHub Pages** (`DATA_MODE === "static"`) - that build has no
 *   `file_host` at all, so there is nothing to fetch. The catalogue resolves
 *   to empty rather than issuing a request that could only fail.
 *
 * An empty catalogue is the honest answer for a build with no material, and
 * it is a *valid* manifest rather than an error: the applet renders its
 * "nothing to study" path instead of a failure it cannot do anything about.
 * The server says the same thing the same way - a corpus nobody has imported
 * into is an empty manifest at 200, not a 404.
 *
 * `createDataSource.fetch()` always resolves an endpoint and issues a
 * request - it has no notion of "this mode has no resource" - so the empty
 * fallback above stays a gate in front of it, not something the data source
 * itself decides. Only a 404, or a response that plainly isn't a manifest,
 * falls back to the empty manifest; anything else (a timeout, a 500, the
 * server's own 400 for a corpus over its manifest ceiling) is a real failure
 * and surfaces as one, same as `hangul-vocab`'s non-404 handling.
 *
 * `manifestShapeSchema` below was once the only thing standing between the
 * applet and an nginx `try_files ... /index.html` fallback, which answers a
 * missing static file with the app shell at HTTP 200. `file_host` answers a
 * missing lesson with a real 404, so that check is now the second line of
 * defence rather than the first - and it stays, because a misconfigured
 * `VITE_FILE_HOST_ENDPOINT` that lands on a static host would bring the same
 * failure straight back.
 */

import { ApiError, createDataSource } from "@some-ui/fetch-kit"
import { z } from "zod"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"
import { fileHostRouteUrl } from "@/lib/file-host-config"

/**
 * A well-formed manifest with nothing in it.
 *
 * Typed structurally rather than as topik's `TopikManifestFile`: importing
 * that type is harmless, but importing anything from `@some-ui/topik` here
 * would put the applet in this app's main bundle and undo the lazy import
 * the content registry exists for. The applet validates this against its
 * own schema on the way in, which is the check that matters.
 */
export const EMPTY_TOPIK_MANIFEST: {
  version: string
  topiks: Array<never>
} = {
  version: "0",
  topiks: [],
}

/**
 * `createDataSource` locators return `URL`. `fileHostRouteUrl` may return a
 * same-origin path (the HTTPS proxy) or an absolute URL (the published
 * port), and resolving against the page's origin handles both. It returns
 * `undefined` only with no `window`, where no request is made anyway.
 */
function toUrl(located: string | undefined): URL {
  if (located === undefined) {
    throw new Error("No file_host base URL outside a browser")
  }
  return new URL(located, window.location.origin)
}

function locateTopikManifestUrl(): URL {
  return toUrl(fileHostRouteUrl("/api/v1/curriculum/manifest.json"))
}

/** A manifest key is a lesson's identity on the server, never a path. */
export function locateTopikFileUrl(key: string): URL {
  return toUrl(fileHostRouteUrl("/api/v1/curriculum/:key", { key }))
}

// The `static` locators are never reached - `FETCHES_CONTENT` gates every
// request below - but `createDataSource` wants one per mode.
const manifestSource = createDataSource<void, unknown>(
  { static: locateTopikManifestUrl, server: locateTopikManifestUrl },
  { mode: DATA_MODE }
)

const topikSource = createDataSource<string, unknown>(
  { static: locateTopikFileUrl, server: locateTopikFileUrl },
  { mode: DATA_MODE }
)

/**
 * Enough to tell "this is a manifest" from "this is an SPA fallback's
 * `index.html`, or otherwise not a manifest" - not `@some-ui/topik`'s real
 * `TopikManifestSchema`, which validates each entry and would need that
 * package's types to write. Importing it here would put the applet back in
 * this app's main bundle. The applet re-validates the full shape on the way
 * in regardless; this check only decides fetch-vs-empty-fallback.
 */
const manifestShapeSchema = z.object({
  version: z.string(),
  topiks: z.array(z.unknown()),
})

/**
 * Whether `error` is the fetch client refusing a body that failed
 * `manifestShapeSchema`. It reports that as status 400, which is also the
 * status `file_host` answers with for a real refusal (a corpus over its
 * manifest ceiling); only the client's own carries the `validation` issues.
 */
function isNotAManifest(error: ApiError): boolean {
  const { data } = error
  return (
    error.status === 400 &&
    typeof data === "object" &&
    data !== null &&
    "validation" in data
  )
}

/** Handed to `KoreanStudyPage` as `loadManifest`. */
export async function loadTopikManifest(): Promise<unknown> {
  if (!FETCHES_CONTENT) return EMPTY_TOPIK_MANIFEST

  try {
    return await manifestSource.fetch(undefined, manifestShapeSchema)
  } catch (error) {
    // A 404 means this `file_host` has no curriculum route to answer with -
    // an older server, most likely - and a body that is not a manifest means
    // the request landed somewhere that is not `file_host` at all. Neither
    // is anything the applet can act on, so both read as "nothing to study".
    // Anything else (a timeout, a 500, the server refusing an oversized
    // corpus) is a real failure and surfaces as one instead of vanishing
    // into the same fallback.
    if (
      error instanceof ApiError &&
      (error.status === 404 || isNotAManifest(error))
    ) {
      return EMPTY_TOPIK_MANIFEST
    }
    throw error
  }
}

/** Handed to `KoreanStudyPage` as `loadTopik`. */
export function loadTopikFile(key: string): Promise<unknown> {
  if (!FETCHES_CONTENT) {
    // Unreachable in practice - a static build's catalogue is empty, so
    // nothing is selectable to load. Explicit anyway, because "silently
    // resolves to nothing" is how a data path stops being debuggable.
    return Promise.reject(
      new Error(
        `This build ships no topik material, so "${key}" cannot be loaded.`
      )
    )
  }
  return topikSource.fetch(key)
}
