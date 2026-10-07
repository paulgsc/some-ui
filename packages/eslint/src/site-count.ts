// The machinery the counted repo checks share: R1 (`react-coordination.ts`)
// and F1 (`foreign-boundary.ts`), both in docs/monorepo-boundaries.md. Each
// counts sites of one syntactic shape per source file and compares the
// counts, exactly and in both directions, with an allowlist whose entries are
// reasoned by a comment line. What a site is, and which reasons an entry may
// give, is each check's own; the scope, the parse and the allowlist are here.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

/** `.then`, `.catch`, `.finally`: a promise chained, a site in both checks. */
export const PROMISE_CHAIN: ReadonlySet<string> = new Set([
  "then",
  "catch",
  "finally",
])

const SCOPE = /^(?:apps|packages|extensions)\//
const SOURCE = /\.[cm]?[jt]sx?$/
const OUT_OF_SCOPE = [
  /(?:^|\/)(?:node_modules|dist|__tests__|__mocks__|tests|test-support|e2e|lint-fixtures)\//,
  /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/,
  /\.d\.[cm]?ts$/,
  /\.gen\.[cm]?[jt]sx?$/,
]

/**
 * Whether `path` (repo-relative, `/`-separated) is source a counted check
 * covers: under `apps`, `packages` or `extensions`, and not a test, story,
 * fixture, generated file or declaration.
 */
export function isInScope(path: string): boolean {
  return (
    SCOPE.test(path) &&
    SOURCE.test(path) &&
    !OUT_OF_SCOPE.some((pattern) => pattern.test(path))
  )
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (/\.[cm]?js$/.test(path)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

/** Parsed with the TypeScript compiler, without types: syntax only. */
export function parseSource(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  )
}

export type AllowlistEntry = {
  readonly path: string
  readonly sites: number
  readonly line: number
  /** Whether its group's comment block has a line matching the reason. */
  readonly reasoned: boolean
}

export type AllowlistProblem = {
  readonly line: number
  readonly text: string
}

/**
 * Entries are `<sites> <path>` lines. A blank line ends a group, and every
 * entry is reasoned by its group's `#` lines: one of them must match
 * `reason` (each check names the labels it accepts).
 */
export function parseCountAllowlist(
  text: string,
  reason: RegExp
): {
  entries: Array<AllowlistEntry>
  problems: Array<AllowlistProblem>
} {
  const entries: Array<AllowlistEntry> = []
  const problems: Array<AllowlistProblem> = []
  let group: Array<{ path: string; sites: number; line: number }> = []
  let reasoned = false
  const close = (): void => {
    for (const entry of group) entries.push({ ...entry, reasoned })
    group = []
    reasoned = false
  }
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trim()
    if (line === "") {
      close()
      continue
    }
    if (line.startsWith("#")) {
      if (reason.test(line)) reasoned = true
      continue
    }
    const entry = /^(?<sites>\d+)\s+(?<path>\S+)$/.exec(line)?.groups
    if (entry?.sites === undefined || entry.path === undefined) {
      problems.push({ line: index + 1, text: raw })
      continue
    }
    group.push({
      path: entry.path,
      sites: Number(entry.sites),
      line: index + 1,
    })
  }
  close()
  return { entries, problems }
}

export type CountViolation =
  | { readonly kind: "malformed"; readonly line: number; readonly text: string }
  | { readonly kind: "duplicate"; readonly path: string; readonly line: number }
  | {
      readonly kind: "unreasoned"
      readonly path: string
      readonly line: number
    }
  | { readonly kind: "unlisted"; readonly path: string; readonly sites: number }
  | {
      readonly kind: "changed"
      readonly path: string
      readonly line: number
      readonly listed: number
      readonly sites: number
    }
  | { readonly kind: "stale"; readonly path: string; readonly line: number }

/**
 * Compares the sites found (`actual`: every in-scope file with at least one
 * site; files with none are left out) against the allowlist.
 */
export function findCountViolations(
  actual: ReadonlyMap<string, number>,
  allowlist: string,
  reason: RegExp
): Array<CountViolation> {
  const { entries, problems } = parseCountAllowlist(allowlist, reason)
  const violations: Array<CountViolation> = problems.map((problem) => ({
    kind: "malformed",
    ...problem,
  }))
  const listed = new Map<string, AllowlistEntry>()
  for (const entry of entries) {
    if (listed.has(entry.path)) {
      violations.push({ kind: "duplicate", path: entry.path, line: entry.line })
      continue
    }
    listed.set(entry.path, entry)
    if (!entry.reasoned)
      violations.push({
        kind: "unreasoned",
        path: entry.path,
        line: entry.line,
      })
    const sites = actual.get(entry.path)
    if (sites === undefined)
      violations.push({ kind: "stale", path: entry.path, line: entry.line })
    else if (sites !== entry.sites)
      violations.push({
        kind: "changed",
        path: entry.path,
        line: entry.line,
        listed: entry.sites,
        sites,
      })
  }
  for (const [path, sites] of [...actual].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (!listed.has(path)) violations.push({ kind: "unlisted", path, sites })
  }
  return violations
}

/** What a counted check says in its own words; the shared messages do the rest. */
export type CountedCheck = {
  /** The log prefix and the invariant: "react-coordination", "R1". */
  readonly tag: string
  readonly id: string
  readonly allowlistFile: string
  /** The `#` line a group's entries are reasoned by. */
  readonly reason: RegExp
  /** The line a new entry goes under: `"# Coordination: <why>"`. */
  readonly reasonLine: string
  /** What that line must say, for an unreasoned entry. */
  readonly reasonHint: string
  /** A file's sites, or null when the check does not cover it. */
  readonly count: (path: string, source: string) => number | null
  /** The kind of site, plural: "await/promise-chain sites". */
  readonly sites: string
  /** What an unlisted file is and the first way out, before "or add …". */
  readonly unlisted: (sites: number) => string
  /** What a raised count means, before "raise the count in …". */
  readonly raised: string
  /** What else a stale entry may be, in parentheses. */
  readonly staleAlso: string
  /** The ok line: "React modules coordinate". */
  readonly counted: string
}

function assertNever(value: never): never {
  throw new Error(`unhandled violation: ${JSON.stringify(value)}`)
}

export function describeCountViolation(
  check: CountedCheck,
  v: CountViolation
): string {
  const file = check.allowlistFile
  switch (v.kind) {
    case "malformed": {
      return `${file}:${v.line}: not a "<sites> <path>" entry, a "#" comment or blank: ${v.text}`
    }
    case "duplicate": {
      return `${file}:${v.line}: ${v.path} is listed twice.`
    }
    case "unreasoned": {
      return `${file}:${v.line}: ${v.path} has no ${check.reasonLine} line in its group. ${check.reasonHint}`
    }
    case "unlisted": {
      return `${v.path}: ${check.unlisted(v.sites)}, or add "${v.sites} ${v.path}" under a ${check.reasonLine} line in ${file}.`
    }
    case "changed": {
      const counted = `${v.path}: ${v.sites} ${check.sites}, listed as ${v.listed}.`
      return v.sites > v.listed
        ? `${counted} ${check.raised} raise the count in ${file}:${v.line}, and if that entry is Grandfathered, move it under its own ${check.reasonLine} (${check.id}).`
        : `${counted} Lower the count in ${file}:${v.line} to match.`
    }
    case "stale": {
      return `${file}:${v.line}: ${v.path} no longer has ${check.sites} ${check.staleAlso}. Remove the entry.`
    }
    default: {
      return assertNever(v)
    }
  }
}

/**
 * The whole-tree run behind `scripts/check-*.ts`: every tracked file plus
 * untracked, non-ignored ones, uncached (an entry is a fact about a file that
 * may no longer exist), compared with the allowlist exactly.
 */
export function runCountedCheck(check: CountedCheck): void {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  const actual = new Map<string, number>()
  for (const path of listed.split("\0")) {
    if (path === "" || !isInScope(path)) continue
    const absolute = join(root, path)
    // Listed but deleted in the working tree.
    if (!existsSync(absolute)) continue
    const sites = check.count(path, readFileSync(absolute, "utf8"))
    if (sites !== null && sites > 0) actual.set(path, sites)
  }
  const allowlist = join(root, check.allowlistFile)
  const violations = findCountViolations(
    actual,
    existsSync(allowlist) ? readFileSync(allowlist, "utf8") : "",
    check.reason
  )
  const out = (line: string): void => void process.stdout.write(`${line}\n`)
  const err = (line: string): void => void process.stderr.write(`${line}\n`)
  for (const violation of violations) {
    err(`[${check.tag}] ${describeCountViolation(check, violation)}`)
  }
  if (violations.length > 0) {
    err(
      `[${check.tag}] ${violations.length} violation(s). See docs/monorepo-boundaries.md, ${check.id}.`
    )
    process.exitCode = 1
  } else {
    out(`[${check.tag}] ok (${actual.size} ${check.counted}, all listed)`)
  }
}
