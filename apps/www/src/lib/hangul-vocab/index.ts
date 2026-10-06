import { useEffect } from "react"
import { ApiError, createDataSource } from "@some-ui/fetch-kit"
import type { WordEntry } from "@some-ui/honeycomb"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"
import { PUBLIC_READ } from "@/lib/file-host-config"

import { HangulVocabFileSchema } from "./schema"

const DEFAULT_HANGUL_VOCAB_TOPIC = "vocab"

type HangulVocabParams = { topic: string }

/**
 * Same relative path in both modes (`/hangul/words/<topic>.json`, from
 * whatever is mounted at `public/hangul/words`; infra/compose/www.yml,
 * scripts/link-content-assets.js). The Pages build ships no companion data,
 * so `useHangulVocab`'s mode gate is what keeps it from fetching.
 */
function locateVocabFile({ topic }: HangulVocabParams): URL {
  return new URL(`/hangul/words/${topic}.json`, window.location.origin)
}

const hangulVocabSource = createDataSource<HangulVocabParams, Array<WordEntry>>(
  { static: locateVocabFile, server: locateVocabFile },
  // One build-time bit, not a runtime hostname guess - see src/lib/data-mode.
  { mode: DATA_MODE, fetchOptions: PUBLIC_READ }
)

/**
 * The apps/www half of "real vocab locally, demo vocab on Pages":
 * `@some-ui/honeycomb` stays fetch-free with its bundled demo `WordEntry[]`
 * (see hangul-words.ts), and this hook is where a host opts into more.
 *
 * - **Pages** (`DATA_MODE === "static"`): the query is disabled; no request.
 * - **Elsewhere**: fetches `/hangul/words/<topic>.json` (gitignored,
 *   developer-populated from `packages/some-content/public/hangul/words`). A
 *   404, common on a fresh checkout, resolves quietly to `undefined`; any
 *   other failure (malformed JSON, a schema mismatch) is also non-fatal but
 *   logged loudly.
 *
 * `undefined` means "no override": pass it straight to `HangulHexGrid`'s
 * `words`, whose default (`HANGUL_WORDS`) takes over. `topic` is unused by
 * callers today (they get `vocab.json`).
 */
export function useHangulVocab(
  topic: string = DEFAULT_HANGUL_VOCAB_TOPIC
): Array<WordEntry> | undefined {
  const { data, error, isError } = hangulVocabSource.useResource(
    ["hangul-vocab", topic],
    { topic },
    HangulVocabFileSchema,
    { enabled: FETCHES_CONTENT, retry: false }
  )

  useEffect(() => {
    if (!isError) return
    // A missing file is steady state; only warn when a file exists but
    // couldn't be used.
    if (error instanceof ApiError && error.status === 404) return
    // eslint-disable-next-line no-console
    console.warn(
      `[hangul-vocab] Failed to load "${topic}.json" - falling back to the bundled demo seed.`,
      error
    )
  }, [isError, error, topic])

  return data
}
