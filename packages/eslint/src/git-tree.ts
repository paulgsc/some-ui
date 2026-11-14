// Git reads the whole-tree checks share: the working tree's files, a base ref
// to hold the tree against (`--base <ref>`, else `origin/main` where it
// exists), and the files as that ref holds them. Imports only Node's, so the
// `scripts/check-*.ts` that use it run with no install.
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

/** Runs git in `root`; null when it exits non-zero. */
export function gitOrNull(
  root: string,
  args: ReadonlyArray<string>
): string | null {
  try {
    return execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/** Runs git in `root` with `input` on stdin, as bytes; throws when it fails. */
export function gitBytes(
  root: string,
  args: ReadonlyArray<string>,
  input?: Buffer
): Buffer {
  return execFileSync("git", [...args], {
    cwd: root,
    input,
    stdio: ["pipe", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * The text of every `<ref>:<path>` in `specs`, in one `git cat-file`, so a
 * tree of hundreds of files costs one process. Throws for one git cannot read.
 */
export function readBlobs(
  root: string,
  specs: ReadonlyArray<string>
): Map<string, string> {
  const texts = new Map<string, string>()
  if (specs.length === 0) return texts
  const out = gitBytes(
    root,
    ["cat-file", "--batch"],
    Buffer.from(`${specs.join("\n")}\n`, "utf8")
  )
  let at = 0
  for (const spec of specs) {
    const eol = out.indexOf(0x0a, at)
    const header = out.subarray(at, eol).toString("utf8").split(" ")
    if (header[1] !== "blob") throw new Error(`could not read ${spec}`)
    const size = Number(header[2])
    texts.set(spec, out.subarray(eol + 1, eol + 1 + size).toString("utf8"))
    at = eol + 1 + size + 1
  }
  return texts
}

export function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()
}

/**
 * Every tracked file plus untracked, non-ignored ones, repo-relative, under
 * `pathspec` when given. `--cached` still lists a tracked file deleted (or
 * moved away) in the working tree until the deletion is staged, so only paths
 * that exist are kept: a check describes the tree as it is now, not as the
 * index last saw it (bot-found on #1531).
 */
export function worktreeFiles(
  root: string,
  pathspec: ReadonlyArray<string> = []
): Array<string> {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      ...pathspec,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  return listed
    .split("\0")
    .filter((path) => path !== "" && existsSync(join(root, path)))
}

/**
 * The ref to compare with, and whether it resolves to a commit. A ref that
 * does not resolve and was not asked for (no `origin/main` in a fresh clone)
 * is `resolved: false`: there is nothing to hold the tree against. Throws for
 * a `--base` that does not resolve, or has no ref after it: a ratchet asked
 * for and skipped would read as passed.
 */
export function resolveBaseRef(
  root: string,
  args: ReadonlyArray<string>
): { ref: string; resolved: boolean } {
  const flag = args.indexOf("--base")
  const asked = flag === -1 ? undefined : args[flag + 1]
  if (flag !== -1 && (asked === undefined || asked === ""))
    throw new Error("--base needs a ref")
  const ref = asked ?? "origin/main"
  const resolved =
    gitOrNull(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !==
    null
  if (!resolved && asked !== undefined)
    throw new Error(`--base ${ref} does not resolve`)
  return { ref, resolved }
}

/**
 * The files at `ref` whose path ends with `suffix`, as path -> text. Throws
 * when the ref's tree or one of its files cannot be read: a comparison with
 * what could not be read would read as passed.
 */
export function readFilesAt(
  root: string,
  ref: string,
  suffix: string
): Map<string, string> {
  const listed = gitOrNull(root, ["ls-tree", "-r", "--name-only", "-z", ref])
  if (listed === null) throw new Error(`could not list the files at ${ref}`)
  const paths = listed
    .split("\0")
    .filter((path) => path !== "" && path.endsWith(suffix))
  const texts = readBlobs(
    root,
    paths.map((path) => `${ref}:${path}`)
  )
  return new Map(paths.map((path) => [path, texts.get(`${ref}:${path}`) ?? ""]))
}
