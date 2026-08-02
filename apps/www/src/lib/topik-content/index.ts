/**
 * Where the Topik applet's study material comes from in this app.
 *
 * `@some-ui/topik` ships two repositories that default to plain HTTP against
 * `/topiks/manifest.json` and `/topiks/<key>.json`, and both factories take
 * a loader precisely so a host can decide where those files actually live
 * (see their factory doc comments). This is that decision for `apps/www`,
 * and it is the same one `hangul-vocab` already
 * make for their content:
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
 */

import { FETCHES_CONTENT } from "@/lib/data-mode"

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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to load ${url}: ${response.status} ${response.statusText}`
    )
  }
  return response.json()
}

/** Handed to `KoreanStudyPage` as `loadManifest`. */
export async function loadTopikManifest(): Promise<unknown> {
  if (!FETCHES_CONTENT) return EMPTY_TOPIK_MANIFEST

  try {
    return await fetchJson(TOPIK_MANIFEST_URL)
  } catch {
    // A 404 here is the common case on a fresh checkout: the material is
    // curated and gitignored (see apps/www/.gitignore), so "nobody has
    // generated any topiks yet" is expected, not broken. An empty catalogue
    // says that in the UI; an exception would only say it in the console.
    return EMPTY_TOPIK_MANIFEST
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
  return fetchJson(locateTopikFile(key))
}
