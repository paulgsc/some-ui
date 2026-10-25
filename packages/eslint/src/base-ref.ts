// The base ref a ratchet compares the working tree with, for the whole-tree
// checks (`site-count.ts`'s allowlists, `policy-docs.ts`'s ID registry): the
// ref `--base <ref>` names, else `origin/main` where it exists. No imports
// beyond Node's, so `scripts/check-policy-docs.ts` runs with no install.
import { execFileSync } from "node:child_process"

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
