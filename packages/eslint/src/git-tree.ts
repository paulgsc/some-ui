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
  const files = new Map<string, string>()
  for (const path of listed.split("\0")) {
    if (path === "" || !path.endsWith(suffix)) continue
    const text = gitOrNull(root, ["show", `${ref}:${path}`])
    if (text === null) throw new Error(`could not read ${path} at ${ref}`)
    files.set(path, text)
  }
  return files
}
