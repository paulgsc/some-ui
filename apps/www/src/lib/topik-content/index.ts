/**
 * Where the Topik applet's study material comes from in this app.
 *
 * `@some-ui/topik` ships two repositories that default to plain HTTP against
 * `/topiks/manifest.json` and `/topiks/<key>.json`, and both factories take
 * a loader precisely so a host can decide where those files actually live
 * (see their factory doc comments). This is that decision for `apps/www`,
 * built on the same `@some-ui/fetch-kit` `createDataSource` that
 * `hangul-vocab` already uses for its content:
 *
 * - **`vite dev` / `vite preview` / Docker** (`DATA_MODE === "server"`) -
 *   fetch from `public/topiks`, which is whatever is symlinked (dev, via
 *   `pnpm content:link`) or bind-mounted (Docker, via
 *   `WWW_TOPIK_ASSETS_PATH`) from `packages/some-content/public/topiks`.
 * - **GitHub Pages** (`DATA_MODE === "static"`) - that build deploys no
 *   companion data at all, so there is nothing to fetch. The catalogue
 *   resolves to empty rather than issuing a request that would 404.
 *
 * An empty catalogue is the honest answer for a build with no material, and
 * it is a *valid* manifest rather than an error: the applet renders its
 * "nothing to study" path instead of a failure it cannot do anything about.
 * That is the same shape as honeycomb falling back to its bundled seed -
 * except topik ships no seed, so empty is the seed.
 *
 * `createDataSource.fetch()` always resolves an endpoint and issues a
 * request - it has no notion of "this mode has no resource" - so the empty
 * fallback above stays a gate in front of it, not something the data source
 * itself decides. Only a 404, or a response that plainly isn't a manifest,
 * falls back to the empty manifest; anything else (a timeout, a 500) is a
 * real failure and surfaces as one, same as `hangul-vocab`'s non-404
 * handling.
 *
 * That second case is not hypothetical: both `nginx.https.conf` and the
 * Dockerfile's nginx config serve every unmatched path via
 * `try_files $uri $uri/ /index.html`, and `vite preview` does the same for
 * SPA navigation. A `public/topiks` that exists but hasn't been
 * populated/mounted (a fresh checkout, an unmounted `WWW_TOPIK_ASSETS_PATH`)
 * therefore answers `/topiks/manifest.json` with `index.html` at HTTP 200,
 * not a 404 - the exact "nobody has generated any topiks yet" case, just
 * dressed up as success. `manifestShapeSchema` below is what catches that.
 */

import { ApiError, createDataSource } from "@some-ui/fetch-kit"
import { z } from "zod"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"

/**
 * Mirrors `packages/some-content/public/topiks`. Same relative path in every
 * mode that serves `public/` - the mode gate is whether a request happens at
 * all, not where it points.
 */
export const TOPIK_CONTENT_ROOT = "/topiks"

export const TOPIK_MANIFEST_URL = `${TOPIK_CONTENT_ROOT}/manifest.json`

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
 * Resolves a manifest entry's key to the file that holds its batches.
 *
 * Keys in the manifest are identifiers, not paths - a key that already
 * looks like a path or URL is passed through, so a manifest can point at
 * material that doesn't sit under `/topiks` if it ever needs to.
 */
export function locateTopikFile(key: string): string {
  if (key.startsWith("/") || key.startsWith("http")) return key
  return `${TOPIK_CONTENT_ROOT}/${key}.json`
}

/**
 * `createDataSource` locators return `URL`, resolved against the page's own
 * origin - same as `hangul-vocab`'s `locateVocabFile`. Both modes share one
 * locator per resource: the interesting decision isn't *where* a file is
 * (same relative path in every mode that serves `public/`), it's *whether*
 * to ask at all, which `loadTopikManifest`/`loadTopikFile` decide via
 * `FETCHES_CONTENT` before either data source is touched.
 */
function locateTopikManifestUrl(): URL {
  return new URL(TOPIK_MANIFEST_URL, window.location.origin)
}

function locateTopikFileUrl(key: string): URL {
  return new URL(locateTopikFile(key), window.location.origin)
}

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

/** Handed to `KoreanStudyPage` as `loadManifest`. */
export async function loadTopikManifest(): Promise<unknown> {
  if (!FETCHES_CONTENT) return EMPTY_TOPIK_MANIFEST

  try {
    return await manifestSource.fetch(undefined, manifestShapeSchema)
  } catch (error) {
    // A 404 is the common case on a fresh checkout: the material is curated
    // and gitignored (see apps/www/.gitignore), so "nobody has generated any
    // topiks yet" is expected, not broken. A response that fails
    // `manifestShapeSchema` (status 400, thrown by the shared fetch client)
    // is the same case wearing an SPA fallback's clothes - see this file's
    // header comment. An empty catalogue says either in the UI; anything
    // else (a timeout, a 500) is a real failure and should surface as one
    // instead of vanishing into the same fallback.
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400)
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
