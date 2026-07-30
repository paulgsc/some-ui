import { useEffect } from "react"
import { ApiError, createDataSource } from "@some-ui/fetch-kit"
import type { Challenge } from "@some-ui/leetype"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"

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
  // One build-time bit, not a runtime hostname guess - see src/lib/data-mode.
  { mode: DATA_MODE }
)

/**
 * The apps/www-only half of the "real corpus locally, demo corpus on GitHub
 * Pages" split (mirrors `useHangulVocab`/`hangul-vocab`). `@some-ui/leetype`
 * stays fetch-free and ships only the bundled demo `CHALLENGES`; this hook
 * is where a host app opts into something else.
 *
 * The fetch-or-seed decision is one build-time bit (`DATA_MODE`), not a
 * runtime guess:
 *
 * - **GitHub Pages**: `"static"`, the query is `enabled: false`, and no
 *   request is ever issued - there is no `public/leetype` dir in that build
 *   to fetch from anyway.
 * - **`vite dev` / `vite preview` / Docker**: fetches `/leetype/challenges.json`
 *   (gitignored, developer-populated - see
 *   `packages/some-content/public/leetype`). A 404 (the common case on a
 *   fresh checkout, before anyone has generated a corpus) resolves quietly
 *   to `undefined`. Any other failure (malformed JSON, a schema mismatch)
 *   is also non-fatal to the caller, but is logged loudly so it doesn't
 *   read as "the feature silently doesn't work."
 *
 * Either way the caller gets back a `challenges` of `Array<Challenge> |
 * undefined`; `undefined` means "no override" - pass it straight through to
 * `Leetype`'s `challenges` prop, whose own default (bundled `CHALLENGES`)
 * takes over.
 *
 * `isPending` is the second half of that answer and is not optional to
 * forward. `challenges` alone collapses two different states into
 * `undefined` - "there is no override" and "the answer isn't back yet" - and
 * `Leetype`'s challenge picker is a *blocking* step the player acts on
 * immediately, so during the fetch window it would offer the bundled demo
 * pool and lock in a pick from it before the real corpus ever arrived. See
 * `Leetype`'s `challengesPending` prop.
 */
export type LeetypeChallengePool = {
  /** The fetched corpus, or `undefined` when there is no override to apply. */
  challenges: Array<Challenge> | undefined
  /** True only while a request is genuinely in flight - see `isPoolPending`. */
  isPending: boolean
}

/**
 * Whether the corpus is still on the wire, from a react-query result.
 *
 * Extracted and exported because the choice here is the whole fix and it is
 * not the obvious one. `isPending` alone is wrong: react-query reports a
 * disabled query (`enabled: false`, i.e. the static GitHub Pages build, where
 * no request is ever issued) as pending *forever*, which would leave the
 * challenge picker waiting on a fetch that is never going to happen. The
 * correct predicate is `isPending && isFetching` - react-query's own
 * `isLoading` - which is false for a disabled query, false after a 404, and
 * false after a successful load, so "no challenges and not pending"
 * unambiguously means "no override, use the bundled pool".
 */
export function isPoolPending(query: {
  isPending: boolean
  isFetching: boolean
}): boolean {
  return query.isPending && query.isFetching
}

export function useLeetypeChallenges(): LeetypeChallengePool {
  const query = leetypeChallengesSource.useResource(
    ["leetype-challenges"],
    {},
    LeetypeChallengesFileSchema,
    { enabled: FETCHES_CONTENT, retry: false }
  )
  const { data, error, isError } = query

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

  return { challenges: data, isPending: isPoolPending(query) }
}
