// The one loader of the calls record (ST37, #2976): every reader of
// `docs/calls/` goes through it, the record's own checks and the routines that
// voice it (`render call-facts`, the interview week's Monday). It reads the
// working tree or any commit, in whichever layout that commit holds: the
// folder, or an older commit's `LEGACY_CALLS_FILE`.
// The rules over the text are `calls.ts`'s. Imports only Node's, so the
// `scripts/check-*.ts` that use it run with no install.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  CALLS_DIR,
  LEGACY_CALLS_FILE,
  readCallFiles,
  readCallsArray,
} from "./calls.ts"
import type { Call, CallFile, CallsFinding } from "./calls.ts"
import { gitBytes, gitOrNull, readBlobs } from "./git-tree.ts"

export type { Call } from "./calls.ts"

/**
 * The record where it was read: its layout, and its calls or why there are
 * none. `none` is a tree that holds neither layout.
 */
export type CallsRecord =
  | { readonly layout: "none" }
  | {
      readonly layout: "folder" | "array"
      readonly calls: ReadonlyArray<Call>
      readonly findings: []
    }
  | {
      readonly layout: "folder" | "array"
      readonly calls: null
      readonly findings: ReadonlyArray<CallsFinding>
    }

/** The record in the working tree under `root`. */
export function callsInTree(root: string): CallsRecord {
  const dir = join(root, CALLS_DIR)
  const legacy = existsSync(join(root, LEGACY_CALLS_FILE))
  if (existsSync(dir)) {
    const files: Array<CallFile> = readdirSync(dir, { withFileTypes: true })
      .map((entry) => ({
        name: entry.name,
        text: entry.isFile()
          ? readFileSync(join(dir, entry.name), "utf8")
          : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const read = readCallFiles(files)
    if (!legacy) return { layout: "folder", ...read }
    return {
      layout: "folder",
      calls: null,
      findings: [...read.findings, { kind: "legacyBeside" }],
    }
  }
  if (legacy)
    return {
      layout: "array",
      ...readCallsArray(readFileSync(join(root, LEGACY_CALLS_FILE), "utf8")),
    }
  return { layout: "none" }
}

/**
 * The record as `commit` holds it, in the repository at `root`. Throws when
 * `commit` does not resolve: a record that could not be looked for is not one
 * that was not there.
 */
export function callsAtCommit(root: string, commit: string): CallsRecord {
  const tree = gitBytes(root, ["ls-tree", "-z", commit, "--", `${CALLS_DIR}/`])
    .toString("utf8")
    .split("\0")
    .filter((line) => line !== "")
    .map((line) => {
      const [meta = "", path = ""] = line.split("\t")
      return { blob: meta.split(" ")[1] === "blob", path }
    })
  if (tree.length > 0) {
    const blobs = tree.filter((t) => t.blob)
    const texts = readBlobs(
      root,
      blobs.map((t) => `${commit}:${t.path}`)
    )
    const files: Array<CallFile> = tree.map((t) => ({
      name: t.path.slice(CALLS_DIR.length + 1),
      text: t.blob ? (texts.get(`${commit}:${t.path}`) ?? null) : null,
    }))
    return { layout: "folder", ...readCallFiles(files) }
  }
  const legacy = gitOrNull(root, ["show", `${commit}:${LEGACY_CALLS_FILE}`])
  if (legacy === null) return { layout: "none" }
  return { layout: "array", ...readCallsArray(legacy) }
}
