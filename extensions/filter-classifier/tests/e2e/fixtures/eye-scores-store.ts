/**
 * Node-only `eye-scores.json` reader, factored out of `eye-score.ts`
 * deliberately: `eye-score.ts` is imported by `harness/entry.ts` and gets
 * esbuild-bundled for the browser (`platform: "browser"`, see
 * `global-setup.ts`) — pulling `node:fs` into that module would either
 * break the browser bundle or ship dead Node-only code into it. Anything
 * that touches disk lives here instead, imported only by Playwright specs
 * (`eye-score-oracle.spec.ts`, #730; `corpus.spec.ts`'s coverage checks,
 * #731), which run in Node, never in the bundled harness.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { EyeScoreMap } from "./eye-score"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const EYE_SCORES_PATH = path.resolve(__dirname, "./eye-scores.json")

export function loadEyeScores(): EyeScoreMap {
  const raw = readFileSync(EYE_SCORES_PATH, "utf8")
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return JSON.parse(raw) as EyeScoreMap
}
