// The tokens of "The phone is Android, and only Android" (CLAUDE.md, "The
// phone and the desktop web are separate surfaces"), as a pure function over
// the tracked files. `scripts/check-android-only.ts` runs it.
//
// Nothing in this repo targets iOS, iPadOS or Safari, so none of these appears
// in source or markup, comments included (the rule adds no comment for them):
// - `webkitAudioContext`: Chrome has `AudioContext`;
// - an Apple meta or link tag (`apple-touch-icon`, `apple-mobile-web-app-*`,
//   `apple-itunes-app`);
// - the words `iphone`, `ipad`, `ipados` and `ipod`, as in a user-agent test.
// A tracked path that names one fails too, whatever the file is.
//
// Held here: those tokens, in files ending in `CODE_EXTENSIONS`. Not held, and
// review's (REVIEW.md, "The phone is Android only"): whether any other line
// exists "for" Safari. Chrome has `webkit`-prefixed APIs of its own, so a
// prefix alone says nothing, and neither does `Safari` (Chrome's user agent
// names it). Markdown and the typst canons are prose and outside the scan, so
// a document can state the rule.

/** Files that define the tokens above, so they name them. */
const EXEMPT: ReadonlySet<string> = new Set([
  "packages/eslint/src/android-only.ts",
  "packages/eslint/tests/android-only.test.ts",
])
const CODE_EXTENSIONS =
  /\.(?:[cm]?[jt]sx?|html?|css|scss|jsonc?|webmanifest|xml|gradle|java|kt|rs|sh|toml|ya?ml)$/
const LOCKFILE = /(?:^|\/)pnpm-lock\.yaml$/

const TOKENS: ReadonlyArray<{
  readonly name: string
  readonly pattern: RegExp
}> = [
  { name: "webkitAudioContext", pattern: /webkitAudioContext/i },
  {
    name: "an Apple meta or link tag",
    pattern: /apple-(?:touch|mobile-web-app|itunes)/i,
  },
  {
    name: "an iPhone, iPad or iPod branch",
    pattern: /\b(?:iphone|ipad|ipados|ipod)\b/i,
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
  return CODE_EXTENSIONS.test(path) && !LOCKFILE.test(path) && !EXEMPT.has(path)
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
    for (const { name, pattern } of TOKENS) {
      if (!EXEMPT.has(file) && pattern.test(file))
        violations.push({ kind: "path", file, token: name })
    }
    if (!inScope(file)) continue
    for (const [index, text] of read(file).split("\n").entries()) {
      for (const { name, pattern } of TOKENS) {
        if (pattern.test(text))
          violations.push({
            kind: "token",
            file,
            line: index + 1,
            token: name,
          })
      }
    }
  }
  return violations
}

const RULE =
  'The phone is Android only (CLAUDE.md, "The phone and the desktop web are separate surfaces"): delete it.'

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
