/**
 * GC1, "A failing required check stops a merge": the checks each
 * repository's `main` must require, and whether GitHub's branch rules still
 * require them (docs/operational-assurance.md, "What `pnpm
 * check:branch-rules` holds"). The server's other checks are GC5.
 */

/** Each repository, and the checks its `main` must require (GC1). */
export const REQUIRED_CHECKS: ReadonlyArray<{
  repo: string
  checks: ReadonlyArray<string>
}> = [
  { repo: "paulgsc/some-ui", checks: ["CI Gate"] },
  {
    repo: "paulgsc/server",
    checks: [
      "Artifact retention",
      "Rust lint",
      "rust_ci",
      "metric_contract_ci",
      "Deny Checks Summary",
    ],
  },
]

/**
 * The status checks the active rules require, from the body of
 * `GET /repos/{owner}/{repo}/rules/branches/{branch}`, or null when the body
 * is not that endpoint's list of rules.
 */
function requiredContexts(body: unknown): Set<string> | null {
  if (!Array.isArray(body)) return null
  const contexts = new Set<string>()
  for (const rule of body) {
    if (typeof rule !== "object" || rule === null) return null
    if (Reflect.get(rule, "type") !== "required_status_checks") continue
    const parameters: unknown = Reflect.get(rule, "parameters")
    const checks =
      typeof parameters === "object" && parameters !== null
        ? Reflect.get(parameters, "required_status_checks")
        : undefined
    if (!Array.isArray(checks)) return null
    for (const check of checks) {
      const context =
        typeof check === "object" && check !== null
          ? Reflect.get(check, "context")
          : undefined
      if (typeof context === "string") contexts.add(context)
    }
  }
  return contexts
}

/**
 * One repository's verdict: `holds`, the checks `main` no longer requires,
 * or `unknown` when the answer is not a list of rules.
 */
export type BranchRules =
  | { verdict: "holds" }
  | { verdict: "broken"; problems: Array<string> }
  | { verdict: "unknown"; problem: string }

export function readBranchRules(
  repo: string,
  checks: ReadonlyArray<string>,
  body: unknown
): BranchRules {
  const contexts = requiredContexts(body)
  if (!contexts)
    return { verdict: "unknown", problem: `${repo}: the rules are unreadable` }
  const problems = checks
    .filter((check) => !contexts.has(check))
    .map((check) => `${repo}: main no longer requires "${check}"`)
  return problems.length === 0
    ? { verdict: "holds" }
    : { verdict: "broken", problems }
}
