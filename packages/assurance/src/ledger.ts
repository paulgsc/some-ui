/**
 * The assurance ledger's shape (docs/operational-assurance.md, "The ledger"),
 * and the one reader that turns its JSON into it or says why it cannot.
 *
 * Pure and dependency-free: `scripts/check-assurance.ts` runs it on Node's
 * own type stripping, and www bundles it.
 */

const LEDGER_SCHEMA = "some-ui.assurance-ledger/1"

/** Which of the two properties an objective serves. */
export type Property = "outcome" | "work"

/** Whether a proof holds the claim, evidence contradicts it, or neither. */
export type Verdict = "holds" | "broken" | "unproven"

export type EvidenceClass = "measured" | "structural" | "derived" | "unknown"

/** How a running deployment is observed for an objective. */
export type WatchBy = "none" | "dashboard" | "alert"

export type Evidence = {
  class: EvidenceClass
  /** What it shows, in a sentence. */
  says: string
  /** A repo path (`some-ui:` or `server:`), an issue (`some-ui#1`) or a URL. */
  ref?: string
}

export type Bound = {
  value: number
  unit: string
  /** Which way is stricter: a deadline is tighter `lower`. */
  tighter: "lower" | "higher"
}

export type Series = {
  label: string
  points: ReadonlyArray<readonly [number, number]>
}

/** A measured before and after, on one workload. */
export type Comparison = {
  /** What was measured, and on what. */
  what: string
  x: string
  y: string
  series: ReadonlyArray<Series>
  /** Where the measurement stops applying. */
  limits: string
}

export type Amendment = {
  /** YYYY-MM-DD. */
  on: string
  /** What changed in the objective. */
  change: string
  why: string
  /** A link to where the owner decided it. */
  decision: string
}

export type Objective = {
  id: string
  /** The requirement kind it instantiates (OA1–OA7, RE1–RE10). */
  kind: string
  property: Property
  claim: string
  requirement: string
  bound?: Bound
  verdict: Verdict
  /** One plain sentence, its boundary included. */
  conclusion: string
  evidence: ReadonlyArray<Evidence>
  /** What holds it, when it holds: `some-ui:path#name` or `server:path#name`. */
  proof?: ReadonlyArray<string>
  /** The issue that will make it hold, when it does not. */
  tracked?: string
  watch: { by: WatchBy; ref?: string }
  comparison?: Comparison
  amendments: ReadonlyArray<Amendment>
  retired?: { on: string; why: string }
}

export type Family = {
  id: string
  /** What the owner uses, in their words. */
  name: string
  why: string
  paths: ReadonlyArray<string>
  /** The server route modules this family owns. */
  modules: ReadonlyArray<string>
  objectives: ReadonlyArray<Objective>
}

export type Ledger = {
  schema: typeof LEDGER_SCHEMA
  families: ReadonlyArray<Family>
  /** Every other server route module, and why it owes no later outcome. */
  synchronous: ReadonlyArray<{ module: string; why: string }>
}

export type Parsed =
  | { ok: true; ledger: Ledger }
  | { ok: false; problems: ReadonlyArray<string> }

const PROPERTIES: ReadonlyArray<Property> = ["outcome", "work"]
const VERDICTS: ReadonlyArray<Verdict> = ["holds", "broken", "unproven"]
const CLASSES: ReadonlyArray<EvidenceClass> = [
  "measured",
  "structural",
  "derived",
  "unknown",
]
const WATCHES: ReadonlyArray<WatchBy> = ["none", "dashboard", "alert"]
const DAY = /^\d{4}-\d{2}-\d{2}$/

type Json = Record<string, unknown>

/**
 * Read the ledger, or every way it is not one. A reader that stopped at the
 * first problem would hide the rest behind it (OA4, on itself).
 */
export function parseLedger(input: unknown): Parsed {
  const problems: Array<string> = []
  const at = (where: string, what: string): void => {
    problems.push(`${where}: ${what}`)
  }

  const root = record(input)
  if (!root) return { ok: false, problems: ["the ledger is not an object"] }
  if (root.schema !== LEDGER_SCHEMA) at("schema", `expected "${LEDGER_SCHEMA}"`)

  const families = list(root.families).flatMap((raw, i) => {
    const family = readFamily(raw, `families[${i}]`, at)
    return family ? [family] : []
  })
  const synchronous = list(root.synchronous).flatMap((raw, i) => {
    const entry = record(raw)
    const where = `synchronous[${i}]`
    if (!entry || !text(entry.module) || !text(entry.why)) {
      at(where, "needs a module and why")
      return []
    }
    return [{ module: entry.module, why: entry.why }]
  })

  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    ledger: { schema: LEDGER_SCHEMA, families, synchronous },
  }
}

function readFamily(
  raw: unknown,
  where: string,
  at: (where: string, what: string) => void
): Family | null {
  const family = record(raw)
  if (!family) {
    at(where, "is not an object")
    return null
  }
  for (const key of ["id", "name", "why"] as const) {
    if (!text(family[key])) at(where, `needs a ${key}`)
  }
  const objectives = list(family.objectives).flatMap((o, i) => {
    const objective = readObjective(o, `${where}.objectives[${i}]`, at)
    return objective ? [objective] : []
  })
  if (objectives.length === 0) at(where, "has no objectives")
  return {
    id: str(family.id),
    name: str(family.name),
    why: str(family.why),
    paths: strings(family.paths, `${where}.paths`, at),
    modules: strings(family.modules, `${where}.modules`, at),
    objectives,
  }
}

function readObjective(
  raw: unknown,
  where: string,
  at: (where: string, what: string) => void
): Objective | null {
  const o = record(raw)
  if (!o) {
    at(where, "is not an object")
    return null
  }
  const id = str(o.id)
  const here = id ? `${where} (${id})` : where
  for (const key of [
    "id",
    "kind",
    "claim",
    "requirement",
    "conclusion",
  ] as const) {
    if (!text(o[key])) at(here, `needs a ${key}`)
  }
  const property = oneOf(o.property, PROPERTIES)
  if (!property) at(here, `property is one of ${PROPERTIES.join(", ")}`)
  const verdict = oneOf(o.verdict, VERDICTS)
  if (!verdict) at(here, `verdict is one of ${VERDICTS.join(", ")}`)

  const evidence = list(o.evidence).flatMap((e, i) => {
    const item = record(e)
    const kind = oneOf(item?.class, CLASSES)
    if (!item || !kind || !text(item.says)) {
      at(
        `${here}.evidence[${i}]`,
        `needs a class (${CLASSES.join(", ")}) and says`
      )
      return []
    }
    return [
      {
        class: kind,
        says: str(item.says),
        ...(text(item.ref) ? { ref: item.ref } : {}),
      },
    ]
  })
  if (evidence.length === 0) at(here, "has no evidence")

  const watch = record(o.watch)
  const by = oneOf(watch?.by, WATCHES)
  if (!by) at(here, `watch.by is one of ${WATCHES.join(", ")}`)

  const amendments = list(o.amendments).flatMap((a, i) => {
    const item = record(a)
    const ok =
      item &&
      DAY.test(str(item.on)) &&
      text(item.change) &&
      text(item.why) &&
      text(item.decision)
    if (!ok) {
      at(
        `${here}.amendments[${i}]`,
        "needs on (YYYY-MM-DD), change, why and decision"
      )
      return []
    }
    return [
      {
        on: str(item.on),
        change: str(item.change),
        why: str(item.why),
        decision: str(item.decision),
      },
    ]
  })

  return {
    id,
    kind: str(o.kind),
    // Where one is missing, its problem is already listed and the ledger is
    // not returned, so the stand-in is never read.
    property: property ?? "outcome",
    claim: str(o.claim),
    requirement: str(o.requirement),
    ...optionalBound(o.bound, here, at),
    verdict: verdict ?? "unproven",
    conclusion: str(o.conclusion),
    evidence,
    ...(o.proof === undefined
      ? {}
      : { proof: strings(o.proof, `${here}.proof`, at) }),
    ...(text(o.tracked) ? { tracked: o.tracked } : {}),
    watch: {
      by: by ?? "none",
      ...(watch && text(watch.ref) ? { ref: watch.ref } : {}),
    },
    ...optionalComparison(o.comparison, here, at),
    amendments,
    ...optionalRetired(o.retired, here, at),
  }
}

function optionalBound(
  raw: unknown,
  where: string,
  at: (where: string, what: string) => void
): { bound?: Bound } {
  if (raw === undefined) return {}
  const b = record(raw)
  const tighter = str(b?.tighter)
  if (
    !b ||
    typeof b.value !== "number" ||
    !text(b.unit) ||
    (tighter !== "lower" && tighter !== "higher")
  ) {
    at(
      `${where}.bound`,
      "needs a number value, a unit and tighter (lower or higher)"
    )
    return {}
  }
  return { bound: { value: b.value, unit: b.unit, tighter } }
}

function optionalComparison(
  raw: unknown,
  where: string,
  at: (where: string, what: string) => void
): { comparison?: Comparison } {
  if (raw === undefined) return {}
  const c = record(raw)
  const series = list(c?.series).flatMap((s) => {
    const item = record(s)
    const points = list(item?.points).flatMap((p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      typeof p[0] === "number" &&
      typeof p[1] === "number"
        ? [[p[0], p[1]] as const]
        : []
    )
    return item && text(item.label) && points.length > 0
      ? [{ label: item.label, points }]
      : []
  })
  if (
    !c ||
    !text(c.what) ||
    !text(c.x) ||
    !text(c.y) ||
    !text(c.limits) ||
    series.length < 2
  ) {
    at(
      `${where}.comparison`,
      "needs what, x, y, limits and at least two series of [x, y] points"
    )
    return {}
  }
  return {
    comparison: { what: c.what, x: c.x, y: c.y, limits: c.limits, series },
  }
}

function optionalRetired(
  raw: unknown,
  where: string,
  at: (where: string, what: string) => void
): { retired?: { on: string; why: string } } {
  if (raw === undefined) return {}
  const r = record(raw)
  if (!r || !DAY.test(str(r.on)) || !text(r.why)) {
    at(`${where}.retired`, "needs on (YYYY-MM-DD) and why")
    return {}
  }
  return { retired: { on: str(r.on), why: str(r.why) } }
}

function record(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function oneOf<T extends string>(
  value: unknown,
  options: ReadonlyArray<T>
): T | null {
  return options.find((option) => option === value) ?? null
}

function list(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function strings(
  value: unknown,
  where: string,
  at: (where: string, what: string) => void
): ReadonlyArray<string> {
  if (!Array.isArray(value) || !value.every(text)) {
    at(where, "is a list of non-empty strings")
    return []
  }
  return value
}
