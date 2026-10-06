// The machinery the counted repo checks share: R1 (`react-coordination.ts`)
// and F1 (`foreign-boundary.ts`), both in docs/monorepo-boundaries.md. Each
// counts sites of one syntactic shape per source file and compares the
// counts, exactly and in both directions, with an allowlist whose entries are
// reasoned by a comment line. What a site is, and which reasons an entry may
// give, is each check's own; the scope, the parse and the allowlist are here.
import ts from "typescript"

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
