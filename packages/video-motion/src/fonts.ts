/**
 * The fonts a composition may use, vendored by the lockfile (`@fontsource/*`,
 * SIL Open Font License 1.1, free to embed in video) and copied into the
 * rendered copy's `fonts/` folder under the names below, so no composition
 * reaches the network for a font and no font file lives in the repository.
 * A composition names them in its own `@font-face` rules.
 */

import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/** A file name under `fonts/`, and the package file it is copied from. */
const FONTS: Readonly<Record<string, string>> = {
  "barlow-condensed-600.woff2":
    "@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2",
  "barlow-condensed-800.woff2":
    "@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2",
}

/** Each font's name under `fonts/` and where it is installed. */
export const fontFiles = (): ReadonlyArray<readonly [string, string]> =>
  Object.entries(FONTS).map(([name, spec]) => [name, require.resolve(spec)])
