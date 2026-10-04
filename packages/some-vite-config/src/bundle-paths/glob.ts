/**
 * A module pattern in path rules: `**` matches anything, `*` anything but
 * `/`, and every other character itself (`?` included, since route ids carry
 * `?tsr-split=...`). The whole id must match.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = ""
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index] ?? ""
    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*"
      index++
    } else if (char === "*") {
      source += "[^/]*"
    } else {
      source += char.replace(/[\\^$.|?+()[\]{}]/g, "\\$&")
    }
  }
  return new RegExp(`^${source}$`)
}

export function matchesAny(
  id: string,
  patterns: ReadonlyArray<string>
): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(id))
}
