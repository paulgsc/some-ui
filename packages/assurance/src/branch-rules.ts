/**
 * GC1, "A failing required check stops a merge": the checks each
 * repository's `main` must require, and whether GitHub's branch rules still
 * require them against the current main (docs/operational-assurance.md, "What `pnpm
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
      // GC5's gate. The five above stay: they are the ones GC1's probes
      // showed blocking a merge (server#529).
      "PR gate",
    ],
  },
]

/**
 * The status checks and merge-order protection the active rules require, from the body of
 * `GET /repos/{owner}/{repo}/rules/branches/{branch}`, or null when the body
 * is not that endpoint's list of rules.
 */
function requiredPolicy(
  body: unknown
): { contexts: Set<string>; currentMain: boolean } | null {
  if (!Array.isArray(body)) return null
  const contexts = new Set<string>()
  let currentMain = false
  for (const rule of body) {
    if (typeof rule !== "object" || rule === null) return null
    if (Reflect.get(rule, "type") === "merge_queue") currentMain = true
    if (Reflect.get(rule, "type") !== "required_status_checks") continue
    const parameters: unknown = Reflect.get(rule, "parameters")
    const checks =
      typeof parameters === "object" && parameters !== null
        ? Reflect.get(parameters, "required_status_checks")
        : undefined
    if (!Array.isArray(checks)) return null
    if (
      typeof parameters === "object" &&
      parameters !== null &&
      Reflect.get(parameters, "strict_required_status_checks_policy") === true
    )
      currentMain = true
    for (const check of checks) {
      const context =
        typeof check === "object" && check !== null
          ? Reflect.get(check, "context")
          : undefined
      if (typeof context === "string") contexts.add(context)
    }
  }
  return { contexts, currentMain }
}

/**
 * One repository's verdict: `holds`, missing checks or merge-order protection,
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
  const policy = requiredPolicy(body)
  if (!policy)
    return { verdict: "unknown", problem: `${repo}: the rules are unreadable` }
  const problems = checks
    .filter((check) => !policy.contexts.has(check))
    .map((check) => `${repo}: main no longer requires "${check}"`)
  if (!policy.currentMain)
    problems.push(
      `${repo}: main requires neither up-to-date branches nor a merge queue`
    )
  return problems.length === 0
    ? { verdict: "holds" }
    : { verdict: "broken", problems }
}
