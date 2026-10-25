// "The phone is Android, and only Android" (CLAUDE.md, "The phone and the
// desktop web are separate surfaces"), as a pure function over the tracked
// files. `scripts/check-android-only.ts` runs it.
//
// The Apple-only tokens in TOKENS fail in files ending in CODE_EXTENSIONS,
// comments included, and in any tracked path's name. Markdown and the typst
// canons are prose and outside the scan, so a document can state the rule.
// `Safari` is no token (Chrome's user agent names it), and a `webkit` prefix
// alone says nothing (Chrome has its own): those stay review's (REVIEW.md,
// "The phone is Android only").

/** Files that define the tokens, so they name them. */
const EXEMPT: ReadonlySet<string> = new Set([
  "packages/eslint/src/android-only.ts",
  "packages/eslint/tests/android-only.test.ts",
])
const CODE_EXTENSIONS =
  /\.(?:[cm]?[jt]sx?|html?|css|scss|jsonc?|webmanifest|xml|gradle|java|kt|rs|sh|toml|ya?ml)$/

const TOKENS: ReadonlyArray<{
  readonly name: string
  readonly patterns: ReadonlyArray<RegExp>
}> = [
  {
    name: "webkitAudioContext",
    patterns: [/webkit(?:Offline)?AudioContext/i],
  },
  {
    name: "an Apple meta or link tag",
    patterns: [/apple-(?:touch|mobile-web-app|itunes)/i],
  },
  {
    name: "an iOS device name",
    patterns: [
      // Not inside another word (`ipAddress`, `tripod`), but after `_` or a digit.
      /(?<![a-z])(?:iphone|ipados|ipad|ipod)(?![a-z])/i,
      // camelCase: `isIPhone`.
      /(?<=[a-z])(?:IPhone|IPad|IPod)(?![a-z])/,
    ],
  },
]

export type AndroidOnlyViolation =
  | {
      readonly kind: "token"
      readonly file: string
      readonly line: number
      readonly token: string
    }
  | {
      readonly kind: "path"
      readonly file: string
      readonly token: string
    }

function inScope(path: string): boolean {
  return CODE_EXTENSIONS.test(path) && !EXEMPT.has(path)
}

function hits(token: (typeof TOKENS)[number], text: string): boolean {
  return token.patterns.some((pattern) => pattern.test(text))
}

/**
 * The violations among `tracked` (repo-relative paths), in path order. `read`
 * gives a file's text; it is called only for files the scan covers.
 */
export function findAndroidOnlyViolations(
  tracked: ReadonlyArray<string>,
  read: (path: string) => string
): Array<AndroidOnlyViolation> {
  const violations: Array<AndroidOnlyViolation> = []
  for (const file of [...tracked].sort()) {
    for (const token of TOKENS) {
      if (hits(token, file))
        violations.push({ kind: "path", file, token: token.name })
    }
    if (!inScope(file)) continue
    for (const [index, text] of read(file).split("\n").entries()) {
      for (const token of TOKENS) {
        if (hits(token, text))
          violations.push({
            kind: "token",
            file,
            line: index + 1,
            token: token.name,
          })
      }
    }
  }
  return violations
}

const RULE = "The phone is Android only: delete it."

/** One human-readable line per violation, naming the fix. */
export function describeAndroidOnlyViolation(
  violation: AndroidOnlyViolation
): string {
  switch (violation.kind) {
    case "token": {
      return `${violation.file}:${violation.line}: ${violation.token}. ${RULE}`
    }
    case "path": {
      return `${violation.file}: its path names ${violation.token}. ${RULE}`
    }
    default: {
      const unhandled: never = violation
      throw new Error(`Unhandled android-only violation: ${String(unhandled)}`)
    }
  }
}
