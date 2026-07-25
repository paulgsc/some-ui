import { useEffect } from "react"
import { ApiError, createDataSource } from "@some-ui/fetch-kit"
import type { WordEntry } from "@some-ui/honeycomb"

import { HangulVocabFileSchema } from "./schema"

export const DEFAULT_HANGUL_VOCAB_TOPIC = "vocab"

type HangulVocabParams = { topic: string }

/**
 * Same relative path for both modes - `/hangul/words/<topic>.json`, served
 * from whatever's mounted/symlinked at `public/hangul/words` (see
 * infra/compose/www.yml and scripts/link-content-assets.js). The two-locator
 * shape only matters for `useHangulVocab`'s mode gate below: a genuine
 * bundled-static fallback would diverge this from `server`, but today there
 * isn't one - the GitHub Pages build ships no companion data at all, and
 * `HangulHexGrid`'s own bundled demo seed is the whole story there.
 */
function locateVocabFile({ topic }: HangulVocabParams): URL {
  return new URL(`/hangul/words/${topic}.json`, window.location.origin)
}

const hangulVocabSource = createDataSource<HangulVocabParams, Array<WordEntry>>(
  { static: locateVocabFile, server: locateVocabFile },
  {
    // Docker/local dev is also reachable over the LAN mDNS hostname
    // vite.config.ts allows (`nixos.local`, for the HTTPS/getUserMedia
    // path) - widen fetch-kit's hostname heuristic to match, so that host
    // resolves to "server" the same as plain localhost does.
    serverHostnames: ["localhost", "127.0.0.1", "[::1]", "nixos.local"],
  }
)

/**
 * The apps/www-only half of the "real vocab locally, demo vocab on GitHub
 * Pages" split (see hangul-words.ts's own header comment for the demo
 * seed's provenance rationale). `@some-ui/honeycomb` stays fetch-free and
 * ships only the bundled demo `WordEntry[]`; this hook is where a host app
 * opts into something else.
 *
 * - **GitHub Pages / any non-server host**: `hangulVocabSource.mode` resolves
 *   to `"static"`, the query is `enabled: false`, and no request is ever
 *   issued - there is no companion server and no `public/hangul/words` dir
 *   in that build to fetch from anyway.
 * - **localhost / Docker / LAN dev**: fetches
 *   `/hangul/words/<topic>.json` (gitignored, developer-populated - see
 *   `packages/some-content/public/hangul/words`). A 404 (the common case on
 *   a fresh checkout, before anyone has generated a file) resolves quietly
 *   to `undefined`. Any other failure (malformed JSON, a schema mismatch -
 *   most likely a hand/LLM-authored `answerKeys`/`answerGlyphs` mistake) is
 *   also non-fatal to the caller, but is logged loudly so it doesn't read as
 *   "the feature silently doesn't work."
 *
 * Either way the caller gets back `Array<WordEntry> | undefined`; `undefined`
 * means "no override" - pass it straight through to `HangulHexGrid`'s
 * `words` prop, whose own default (`HANGUL_WORDS`) takes over.
 *
 * `topic` is forward-looking, not load-bearing today: the shim's one user
 * story is "one active LLM-generated file," so every caller currently omits
 * it and gets `vocab.json`. A future topic-picker UI (part of the eventual
 * adaptive-learning design, not this stub) can thread a real topic id
 * through without this hook's shape changing.
 */
export function useHangulVocab(
  topic: string = DEFAULT_HANGUL_VOCAB_TOPIC
): Array<WordEntry> | undefined {
  const { data, error, isError } = hangulVocabSource.useResource(
    ["hangul-vocab", topic],
    { topic },
    HangulVocabFileSchema,
    {
      enabled: hangulVocabSource.mode === "server",
      retry: false,
    }
  )

  useEffect(() => {
    if (!isError) return
    // A missing file is steady state (nobody's generated one yet, or this
    // topic doesn't have one) - only warn about failures that mean a file
    // exists but this app couldn't use it.
    if (error instanceof ApiError && error.status === 404) return
    // eslint-disable-next-line no-console
    console.warn(
      `[hangul-vocab] Failed to load "${topic}.json" - falling back to the bundled demo seed.`,
      error
    )
  }, [isError, error, topic])

  return data
}
