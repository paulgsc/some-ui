// The one loader of the calls record (ST37, #2976): every reader of
// `docs/calls/` goes through it, the record's own checks and the routines that
// voice it (`render call-facts`, the interview week's Monday). It reads the
// working tree or any commit, in whichever layout that commit holds: the
// folder, one file per call, or before #2976 the one-array `docs/calls.json`.
// The rules over the text are `calls.ts`'s. Imports only Node's, so the
// `scripts/check-*.ts` that use it run with no install.
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  CALLS_DIR,
  LEGACY_CALLS_FILE,
  readCallFiles,
  readCallsArray,
} from "./calls.ts"
import type { Call, CallFile, CallsFinding } from "./calls.ts"

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

const git = (
  root: string,
  args: ReadonlyArray<string>,
  input?: Buffer
): Buffer =>
  execFileSync("git", [...args], {
    cwd: root,
    input,
    stdio: ["pipe", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  })

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
  const tree = git(root, ["ls-tree", "-z", commit, "--", `${CALLS_DIR}/`])
    .toString("utf8")
    .split("\0")
    .filter((line) => line !== "")
    .map((line) => {
      const [meta = "", path = ""] = line.split("\t")
      return { blob: meta.split(" ")[1] === "blob", path }
    })
  if (tree.length > 0) {
    const blobs = tree.filter((t) => t.blob)
    const texts = catFiles(
      root,
      blobs.map((t) => `${commit}:${t.path}`)
    )
    const files: Array<CallFile> = tree.map((t) => ({
      name: t.path.slice(CALLS_DIR.length + 1),
      text: t.blob ? (texts.get(`${commit}:${t.path}`) ?? null) : null,
    }))
    return { layout: "folder", ...readCallFiles(files) }
  }
  const legacy = git(root, [
    "ls-tree",
    "--name-only",
    commit,
    "--",
    LEGACY_CALLS_FILE,
  ])
    .toString("utf8")
    .trim()
  if (legacy === "") return { layout: "none" }
  return {
    layout: "array",
    ...readCallsArray(
      git(root, ["show", `${commit}:${LEGACY_CALLS_FILE}`]).toString("utf8")
    ),
  }
}

/**
 * The text of every `<commit>:<path>` in `specs`, in one `git cat-file`, so a
 * record of hundreds of files costs one process, not hundreds.
 */
function catFiles(
  root: string,
  specs: ReadonlyArray<string>
): ReadonlyMap<string, string> {
  const texts = new Map<string, string>()
  if (specs.length === 0) return texts
  const out = git(
    root,
    ["cat-file", "--batch"],
    Buffer.from(`${specs.join("\n")}\n`, "utf8")
  )
  let at = 0
  for (const spec of specs) {
    const eol = out.indexOf(0x0a, at)
    const header = out.subarray(at, eol).toString("utf8").split(" ")
    if (header[1] === "missing") throw new Error(`git cannot read ${spec}`)
    const size = Number(header[2])
    texts.set(spec, out.subarray(eol + 1, eol + 1 + size).toString("utf8"))
    at = eol + 1 + size + 1
  }
  return texts
}
