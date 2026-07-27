import { useEffect } from "react"
import { ApiError, createDataSource } from "@some-ui/fetch-kit"
import type { Challenge } from "@some-ui/leetype"

import { LeetypeChallengesFileSchema } from "./schema"

type LeetypeChallengesParams = Record<string, never>

/**
 * Same relative path in both modes - `/leetype/challenges.json`, served from
 * whatever's mounted/symlinked at `public/leetype` (see
 * infra/compose/www.yml and scripts/link-content-assets.js). The two-locator
 * shape only matters for `useLeetypeChallenges`'s mode gate below: the
 * GitHub Pages build ships no companion corpus at all - `Leetype`'s own
 * bundled demo pool (`@some-ui/content`'s `CHALLENGES`) is the whole story
 * there.
 */
function locateChallengesFile(_params: LeetypeChallengesParams): URL {
  return new URL("/leetype/challenges.json", window.location.origin)
}

const leetypeChallengesSource = createDataSource<
  LeetypeChallengesParams,
  Array<Challenge>
>(
  { static: locateChallengesFile, server: locateChallengesFile },
  {
    // Docker/local dev is also reachable over the LAN mDNS hostname
    // vite.config.ts allows (`nixos.local`, for the HTTPS/getUserMedia
    // path) - widen fetch-kit's hostname heuristic to match, so that host
    // resolves to "server" the same as plain localhost does.
    serverHostnames: ["localhost", "127.0.0.1", "[::1]", "nixos.local"],
  }
)

/**
 * The apps/www-only half of the "real corpus locally, demo corpus on GitHub
 * Pages" split (mirrors `useHangulVocab`/`hangul-vocab`). `@some-ui/leetype`
 * stays fetch-free and ships only the bundled demo `CHALLENGES`; this hook
 * is where a host app opts into something else.
 *
 * - **GitHub Pages / any non-server host**: `leetypeChallengesSource.mode`
 *   resolves to `"static"`, the query is `enabled: false`, and no request is
 *   ever issued - there is no companion server and no `public/leetype` dir
 *   in that build to fetch from anyway.
 * - **localhost / Docker / LAN dev**: fetches `/leetype/challenges.json`
 *   (gitignored, developer-populated - see
 *   `packages/some-content/public/leetype`). A 404 (the common case on a
 *   fresh checkout, before anyone has generated a corpus) resolves quietly
 *   to `undefined`. Any other failure (malformed JSON, a schema mismatch)
 *   is also non-fatal to the caller, but is logged loudly so it doesn't
 *   read as "the feature silently doesn't work."
 *
 * Either way the caller gets back `Array<Challenge> | undefined`;
 * `undefined` means "no override" - pass it straight through to `Leetype`'s
 * `challenges` prop, whose own default (bundled `CHALLENGES`) takes over.
 */
export function useLeetypeChallenges(): Array<Challenge> | undefined {
  const { data, error, isError } = leetypeChallengesSource.useResource(
    ["leetype-challenges"],
    {},
    LeetypeChallengesFileSchema,
    {
      enabled: leetypeChallengesSource.mode === "server",
      retry: false,
    }
  )

  useEffect(() => {
    if (!isError) return
    // A missing file is steady state (nobody's generated a corpus yet) -
    // only warn about failures that mean a file exists but this app
    // couldn't use it.
    if (error instanceof ApiError && error.status === 404) return
    // eslint-disable-next-line no-console
    console.warn(
      "[leetype-challenges] Failed to load challenges.json - falling back to the bundled demo challenges.",
      error
    )
  }, [isError, error])

  return data
}
