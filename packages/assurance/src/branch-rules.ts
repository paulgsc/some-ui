/**
 * GC1, "A failing check stops a merge": the checks each repository's `main`
 * must require, and what GitHub's branch rules say is required today.
 *
 * A repository setting can be switched off with no diff, so the ledger's
 * `holds` for GC1 rests on `scripts/check-branch-rules.ts` reading the rules
 * on every pull request and every day. The server's other checks gating a
 * merge is GC5, not this.
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
export function requiredContexts(body: unknown): Set<string> | null {
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

/** What is wrong with one repository's rules, one line each; empty when GC1 holds there. */
export function branchRuleProblems(
  repo: string,
  checks: ReadonlyArray<string>,
  body: unknown
): Array<string> {
  const contexts = requiredContexts(body)
  if (!contexts) return [`${repo}: the branch rules could not be read`]
  return checks
    .filter((check) => !contexts.has(check))
    .map((check) => `${repo}: main no longer requires "${check}"`)
}
