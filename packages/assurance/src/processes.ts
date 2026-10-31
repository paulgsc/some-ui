/**
 * What `pnpm check:assurance` holds of the registry
 * (docs/operational-assurance.md, "The registry: every process family"), as
 * a pure function over the parsed ledger: every name a process, a check or
 * a watch uses exists, every ledger family is carried by a process or said
 * to span them all, and a family that nothing shows working is reported.
 */
import type { Ledger, Process } from "./ledger.ts"
import type { Finding, Surroundings } from "./rules.ts"

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISSUE = /^(some-ui|server)#\d+$/
const PATH = /^(some-ui|server):[^\s#]+(?:#.+)?$/
const REF = /^([a-z0-9-]+)\/([a-z0-9-]+)$/
const REGISTRY = "registry"

/**
 * The registry against the ledger and the tree. Errors are a name that
 * points at nothing and a family with no process; warnings are a process
 * nothing shows working, which is a gap to see, not a reason to fail.
 */
export function findProcessViolations(
  ledger: Ledger,
  around: Pick<Surroundings, "exists">
): ReadonlyArray<Finding> {
  const findings: Array<Finding> = []
  const flag = (id: string, message: string): void => {
    findings.push({ id, message, level: "error" })
  }
  const report = (id: string, message: string): void => {
    findings.push({ id, message, level: "warning" })
  }
  const path = (id: string, what: string, ref: string): void => {
    if (!PATH.test(ref)) {
      flag(id, `${what} "${ref}" is some-ui:<path> or server:<path>`)
      return
    }
    // The server's own `Assurance ledger` job is where a server path would
    // be checked; this tree only holds its own.
    if (!ref.startsWith("some-ui:")) return
    const file = ref.slice("some-ui:".length).split("#")[0] ?? ""
    if (!around.exists(file)) flag(id, `${what} ${file} does not exist`)
  }

  const families = new Set(ledger.families.map((f) => f.id))
  const objectives = new Map(
    ledger.families.flatMap((f) => f.objectives.map((o) => [o.id, o] as const))
  )
  const byId = new Map<string, Process>()
  for (const process of ledger.processes) {
    if (!NAME.test(process.id))
      flag(process.id, "a process id is lowercase words joined by hyphens")
    if (byId.has(process.id)) flag(process.id, "process id is used twice")
    byId.set(process.id, process)
  }

  /** Whether `ref` names a segment, `<process>/<segment>`. */
  const segmentAt = (ref: string): boolean => {
    const match = REF.exec(ref)
    const process = match ? byId.get(match[1] ?? "") : undefined
    return process?.segments.some((s) => s.id === match?.[2]) ?? false
  }
  /** The processes whose segments some check exercises. */
  const checked = new Set<string>()

  for (const p of ledger.processes) {
    const seen = new Set<string>()
    for (const s of p.segments) {
      const at = `${p.id}/${s.id}`
      if (!NAME.test(s.id))
        flag(at, "a segment id is lowercase words joined by hyphens")
      if (seen.has(s.id)) flag(at, "segment id is used twice in its process")
      seen.add(s.id)
      if ((s.owner === "network") !== (s.on === "between"))
        flag(at, "a network segment, and only one, runs between two places")
      if (s.owner === "ours" && s.on === "outside")
        flag(at, "a segment of ours runs on a place of ours")
      for (const ref of s.paths) path(at, "path", ref)
    }

    for (const family of p.serves) {
      if (!families.has(family))
        flag(p.id, `serves "${family}", which is no family in the ledger`)
    }
    for (const id of p.witnesses) {
      const objective = objectives.get(id)
      if (!objective)
        flag(p.id, `witnesses "${id}", which is no objective in the ledger`)
      else if (objective.retired)
        flag(p.id, `witnesses ${id}, which has retired`)
    }

    p.signals.forEach((signal, i) => {
      const at = `${p.id} signal ${i + 1}`
      if (signal.status === "live") {
        if (signal.ref === undefined) flag(at, "is live, so it names a ref")
        else path(at, "ref", signal.ref)
      } else if (!signal.tracked || !ISSUE.test(signal.tracked))
        flag(at, "is planned, so it names its issue (some-ui#N or server#N)")
    })

    const checkIds = new Set<string>()
    for (const check of p.checks) {
      const at = `${p.id}/${check.id}`
      if (!NAME.test(check.id))
        flag(at, "a check id is lowercase words joined by hyphens")
      if (checkIds.has(check.id))
        flag(at, "check id is used twice in its process")
      checkIds.add(check.id)
      if (check.status === "live") {
        if (check.ref === undefined) flag(at, "is live, so it names a ref")
        else path(at, "ref", check.ref)
      } else if (!check.tracked || !ISSUE.test(check.tracked))
        flag(at, "is planned, so it names its issue (some-ui#N or server#N)")
      if (check.segments.length === 0)
        flag(at, "names the segments it exercises")
      if (!check.segments.some((ref) => ref.startsWith(`${p.id}/`)))
        flag(
          at,
          `exercises at least one segment of ${p.id}, where it is listed`
        )
      for (const ref of check.segments) {
        if (!segmentAt(ref))
          flag(at, `segment "${ref}" is no <process>/<segment> in the registry`)
        else checked.add(ref.split("/")[0] ?? "")
      }
    }
  }

  // Every ledger family is carried by a process, or spans them all: a new
  // family cannot land without saying which.
  const served = new Set(ledger.processes.flatMap((p) => p.serves))
  const spanning = new Set<string>()
  for (const entry of ledger.crosscutting) {
    if (!families.has(entry.family))
      flag(
        REGISTRY,
        `crosscutting "${entry.family}" is no family in the ledger`
      )
    if (spanning.has(entry.family))
      flag(REGISTRY, `crosscutting lists "${entry.family}" twice`)
    if (served.has(entry.family))
      flag(
        REGISTRY,
        `"${entry.family}" is crosscutting and served by a process: it is one or the other`
      )
    spanning.add(entry.family)
  }
  for (const family of families) {
    if (!served.has(family) && !spanning.has(family))
      flag(
        family,
        "no process in the registry serves this family, and it is not crosscutting: add its process, with its segments, signals and checks"
      )
  }

  // A watch names only checks that run, of a process that says it shows the
  // objective: a planned check watches nothing yet.
  for (const family of ledger.families) {
    for (const o of family.objectives) {
      for (const ref of o.watch.checks ?? []) {
        const match = REF.exec(ref)
        const process = match ? byId.get(match[1] ?? "") : undefined
        const check = process?.checks.find((c) => c.id === match?.[2])
        if (!process || !check)
          flag(
            o.id,
            `watch check "${ref}" is no <process>/<check> in the registry`
          )
        else if (check.status !== "live")
          flag(o.id, `watch check ${ref} is planned, so it watches nothing yet`)
        else if (!process.witnesses.includes(o.id))
          flag(
            o.id,
            `watch check ${ref} is of ${process.id}, which does not witness ${o.id}`
          )
      }
    }
  }

  for (const p of ledger.processes) {
    if (p.signals.length === 0)
      report(
        p.id,
        "nothing real use leaves shows it working (no passive signal)"
      )
    if (!checked.has(p.id)) report(p.id, "no check can run it")
    if (p.witnesses.length === 0)
      report(p.id, "witnesses no promise in the ledger yet")
  }
  return findings
}
