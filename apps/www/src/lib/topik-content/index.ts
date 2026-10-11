/**
 * Where the Topik applet's study material comes from in this app: the loader
 * `@some-ui/topik`'s repository factories take, built on `@some-ui/fetch-kit`
 * `createDataSource` like the web surface's Hangul vocab
 * (`lib/web-surface/hangul`).
 *
 * - **`DATA_MODE === "server"`** (`vite dev`/`preview`, Docker): `file_host`'s
 *   curriculum routes (`/api/v1/curriculum/manifest.json`, `/:key`) at the
 *   usual `lib/file-host-config` base. A lesson is a row the server owns,
 *   added with `import-curriculum` (paulgsc/server);
 *   `packages/some-content/public/topiks` is that importer's input.
 * - **`DATA_MODE === "static"`** (Pages): no `file_host`, so the catalogue
 *   resolves to empty without a request.
 *
 * The served scene trees (`loadTreeManifest`) are the same routes' `makjang`
 * activity (`?activity=makjang`): only topik's handheld lesson reads them,
 * and each loads by key like any lesson.
 *
 * An empty catalogue is a *valid* manifest, not an error, so the applet shows
 * "nothing to study" (the server also answers an unimported corpus with an
 * empty manifest at 200). Only a 404 or a body that plainly isn't a manifest
 * falls back to it; anything else (a timeout, a 500, the server's 400 for an
 * oversized corpus) surfaces as a failure.
 *
 * `manifestShapeSchema` guards against an SPA `try_files ... /index.html`
 * fallback (the app shell at 200), e.g. a `VITE_FILE_HOST_ENDPOINT` that
 * lands on a static host.
 */

import { ApiError, createDataSource } from "@some-ui/fetch-kit"
import { z } from "zod"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"
import { fileHostRouteUrl, PUBLIC_READ } from "@/lib/file-host-config"

/**
 * A well-formed manifest with nothing in it. Typed structurally: importing
 * anything from `@some-ui/topik` would put the applet in the main bundle. The
 * applet validates it against its own schema.
 */
export const EMPTY_TOPIK_MANIFEST: {
  version: string
  topiks: Array<never>
} = {
  version: "0",
  topiks: [],
}

/**
 * `fileHostRouteUrl` may return a same-origin path (the HTTPS proxy) or an
 * absolute URL; resolving against the page's origin handles both. It is
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

/**
 * The curriculum activity served scene trees are listed under: topik's
 * `TREE_ACTIVITY`, spelled again here because importing topik would put the
 * applet in the main bundle.
 */
export const TREE_ACTIVITY = "makjang"

function locateTreeManifestUrl(): URL {
  const url = locateTopikManifestUrl()
  url.searchParams.set("activity", TREE_ACTIVITY)
  return url
}

/** A manifest key is a lesson's identity on the server, never a path. */
export function locateTopikFileUrl(key: string): URL {
  return toUrl(fileHostRouteUrl("/api/v1/curriculum/:key", { key }))
}

// The `static` locators are never reached - `FETCHES_CONTENT` gates every
// request below - but `createDataSource` wants one per mode.
const manifestSource = createDataSource<void, unknown>(
  { static: locateTopikManifestUrl, server: locateTopikManifestUrl },
  { mode: DATA_MODE, fetchOptions: PUBLIC_READ }
)

const treeManifestSource = createDataSource<void, unknown>(
  { static: locateTreeManifestUrl, server: locateTreeManifestUrl },
  { mode: DATA_MODE, fetchOptions: PUBLIC_READ }
)

const topikSource = createDataSource<string, unknown>(
  { static: locateTopikFileUrl, server: locateTopikFileUrl },
  { mode: DATA_MODE, fetchOptions: PUBLIC_READ }
)

/**
 * Enough to tell a manifest from an SPA fallback's `index.html`; not
 * `TopikManifestSchema`, which would pull the applet into the main bundle.
 * The applet re-validates the full shape.
 */
const manifestShapeSchema = z.object({
  version: z.string(),
  topiks: z.array(z.unknown()),
})

/**
 * Whether `error` is the fetch client refusing a body that failed
 * `manifestShapeSchema`. Both it and `file_host`'s real refusal are 400; only
 * the client's carries `validation` issues.
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

/** A manifest, or the empty one where this build or host has none. */
async function loadManifestFrom(
  source: typeof manifestSource
): Promise<unknown> {
  if (!FETCHES_CONTENT) return EMPTY_TOPIK_MANIFEST

  try {
    return await source.fetch(undefined, manifestShapeSchema)
  } catch (error) {
    // A 404 (an older server with no curriculum route) or a body that is not
    // a manifest (not `file_host` at all) reads as "nothing to study".
    if (
      error instanceof ApiError &&
      (error.status === 404 || isNotAManifest(error))
    ) {
      return EMPTY_TOPIK_MANIFEST
    }
    throw error
  }
}

/** Handed to `KoreanStudyPage` as `loadManifest`. */
export const loadTopikManifest = (): Promise<unknown> =>
  loadManifestFrom(manifestSource)

/** Handed to `KoreanStudyPage` as `loadTreeManifest`. */
export const loadTreeManifest = (): Promise<unknown> =>
  loadManifestFrom(treeManifestSource)

/** Handed to `KoreanStudyPage` as `loadTopik`. */
export function loadTopikFile(key: string): Promise<unknown> {
  if (!FETCHES_CONTENT) {
    // Unreachable in practice (a static catalogue is empty), but explicit
    // rather than silently resolving to nothing.
    return Promise.reject(
      new Error(
        `This build ships no topik material, so "${key}" cannot be loaded.`
      )
    )
  }
  return topikSource.fetch(key)
}
