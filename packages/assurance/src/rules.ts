/**
 * What `pnpm check:assurance` holds (docs/operational-assurance.md, "What
 * `pnpm check:assurance` holds"), as pure functions over the parsed ledger.
 * The script supplies what they cannot see themselves: the files on disk,
 * the server's route modules, the IDs the markdown already declares, and the
 * base branch's ledger.
 */
import type { Bound, Ledger, Objective } from "./ledger.ts"

export type Finding = { id: string; message: string }

/** What the ledger's checks need from outside it. */
export type Surroundings = {
  /** Whether `path` (repo-relative) exists in this repository. */
  exists: (path: string) => boolean
  /** Whether the file at `path` contains `text`. */
  contains: (path: string, text: string) => boolean
  /** Every module the server serves a route from (routes.server.json). */
  routeModules: ReadonlyArray<string>
  /** IDs an invariant already declares in a markdown file. */
  declaredIds: ReadonlySet<string>
}

const ID = /^[A-Z]{1,4}\d+$/
const KIND = /^(OA[1-7]|RE([1-9]|10))$/
const ISSUE = /^(some-ui|server)#\d+$/
const PROOF = /^(some-ui|server):[^#\s]+(#.+)?$/
const LEDGER = "ledger"

/** The ledger on its own: shape beyond parsing, proofs, issues, coverage. */
export function findLedgerViolations(
  ledger: Ledger,
  around: Surroundings
): ReadonlyArray<Finding> {
  const findings: Array<Finding> = []
  const flag = (id: string, message: string): void => {
    findings.push({ id, message })
  }

  const seen = new Set<string>()
  const familyIds = new Set<string>()
  for (const family of ledger.families) {
    if (familyIds.has(family.id)) flag(family.id, "family id is used twice")
    familyIds.add(family.id)
    for (const o of family.objectives) {
      if (!ID.test(o.id))
        flag(o.id, "an ID is an area prefix and a number, like MI1")
      if (seen.has(o.id)) flag(o.id, "ID is used twice")
      seen.add(o.id)
      if (around.declaredIds.has(o.id))
        flag(o.id, "ID is already an invariant declared in a markdown file")
      if (!KIND.test(o.kind))
        flag(o.id, `kind "${o.kind}" is not one of OA1–OA7, RE1–RE10`)
      for (const f of proofOrIssue(o, around)) flag(o.id, f)
    }
  }

  const owners = new Map<string, string>()
  const claim = (module: string, by: string): void => {
    const other = owners.get(module)
    if (other) flag(LEDGER, `module "${module}" is in both ${other} and ${by}`)
    owners.set(module, by)
  }
  for (const family of ledger.families) {
    for (const module of family.modules) claim(module, family.id)
  }
  for (const entry of ledger.synchronous) claim(entry.module, "synchronous")
  const served = new Set(around.routeModules)
  for (const module of served) {
    if (!owners.has(module))
      flag(
        LEDGER,
        `server module "${module}" is in no family and not in synchronous (OA1)`
      )
  }
  for (const module of owners.keys()) {
    if (!served.has(module))
      flag(LEDGER, `module "${module}" is not one the server serves`)
  }
  return findings
}

function proofOrIssue(o: Objective, around: Surroundings): Array<string> {
  const out: Array<string> = []
  if (o.retired) return out
  if (o.verdict === "holds") {
    if (!o.proof || o.proof.length === 0)
      out.push("holds, so it names the proof that holds it")
    for (const proof of o.proof ?? []) {
      if (!PROOF.test(proof)) {
        out.push(
          `proof "${proof}" is some-ui:<path>[#name] or server:<path>[#name]`
        )
        continue
      }
      if (!proof.startsWith("some-ui:")) continue
      const [path = "", name] = proof.slice("some-ui:".length).split("#")
      if (!around.exists(path)) out.push(`proof path ${path} does not exist`)
      else if (name !== undefined && !around.contains(path, name))
        out.push(`proof ${path} does not mention "${name}"`)
    }
  } else if (!o.tracked || !ISSUE.test(o.tracked)) {
    out.push(
      `${o.verdict}, so it names the issue that tracks it (some-ui#N or server#N)`
    )
  }
  return out
}

/**
 * The ratchet against the base branch's ledger: what may change about an
 * objective only with a new amendment on it, and what may never change.
 */
export function findRatchetViolations(
  base: Ledger,
  head: Ledger
): ReadonlyArray<Finding> {
  const findings: Array<Finding> = []
  const headById = new Map(objectives(head).map((o) => [o.id, o]))
  for (const before of objectives(base)) {
    const after = headById.get(before.id)
    if (!after) {
      findings.push({
        id: before.id,
        message: "was removed; an objective retires instead, with an amendment",
      })
      continue
    }
    const kept = before.amendments.every(
      (a, i) => JSON.stringify(a) === JSON.stringify(after.amendments[i])
    )
    if (!kept) {
      findings.push({
        id: before.id,
        message:
          "rewrote or removed an amendment; amendments are only appended",
      })
    }
    if (before.retired && !after.retired) {
      findings.push({
        id: before.id,
        message: "a retired objective stays retired",
      })
    }
    const amended = after.amendments.length > before.amendments.length
    const changes = weakenings(before, after)
    if (changes.length > 0 && !amended) {
      findings.push({
        id: before.id,
        message: `${changes.join("; ")}: that needs a new amendment on ${before.id}, with the owner's decision`,
      })
    }
  }
  return findings
}

function weakenings(before: Objective, after: Objective): Array<string> {
  const out: Array<string> = []
  if (before.verdict === "holds" && after.verdict !== "holds")
    out.push(`its verdict went from holds to ${after.verdict}`)
  if (before.requirement !== after.requirement)
    out.push("its requirement changed")
  if (before.kind !== after.kind) out.push("its kind changed")
  const bound = loosened(before.bound, after.bound)
  if (bound) out.push(bound)
  if (!before.retired && after.retired) out.push("it retired")
  return out
}

function loosened(
  before: Bound | undefined,
  after: Bound | undefined
): string | null {
  if (!before) return null
  if (!after) return "its bound was dropped"
  if (before.unit !== after.unit || before.tighter !== after.tighter)
    return "its bound changed what it measures"
  const looser =
    before.tighter === "lower"
      ? after.value > before.value
      : after.value < before.value
  return looser
    ? `its bound loosened from ${before.value} to ${after.value} ${after.unit}`
    : null
}

function objectives(ledger: Ledger): ReadonlyArray<Objective> {
  return ledger.families.flatMap((f) => f.objectives)
}
