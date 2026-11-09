import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"

export const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trimEnd()
export const hasBase = (base) => Boolean(base && !/^0+$/.test(base))
export const jsonAt = (ref, file) => JSON.parse(git("show", `${ref}:${file}`))
export const changedFiles = (base, head = "HEAD") =>
  git("diff", "--name-only", "--no-renames", "-z", base, head)
    .split("\0")
    .filter(Boolean)

// RT1: generated version/changelog/intent bookkeeping is not a new source
// change. Dependency maps, scripts and every other manifest field still count.
// Additions/deletions of manifests count, even if their only field is version.
export function sourceFiles(base, head = "HEAD") {
  if (!hasBase(base)) return null
  return changedFiles(base, head).filter((file) => {
    if (
      /(^|\/)CHANGELOG\.md$/.test(file) ||
      /^\.changeset\/[^/]+\.md$/.test(file)
    )
      return false
    if (!/(^|\/)package\.json$/.test(file)) return true
    const status = git(
      "diff",
      "--name-status",
      "--no-renames",
      base,
      head,
      "--",
      file
    )
    if (!status.startsWith("M\t")) return true
    const before = jsonAt(base, file)
    const after = jsonAt(head, file)
    delete before.version
    delete after.version
    return !isDeepStrictEqual(before, after)
  })
}

export function bumpedPackages(packages, base, head = "HEAD") {
  if (!hasBase(base)) return []
  const files = new Set(changedFiles(base, head))
  return packages.filter((pkg) => {
    if (!files.has(pkg.file)) return false
    const status = git(
      "diff",
      "--name-status",
      "--no-renames",
      base,
      head,
      "--",
      pkg.file
    )
    return (
      status.startsWith("M\t") &&
      jsonAt(base, pkg.file).version !== jsonAt(head, pkg.file).version
    )
  })
}
