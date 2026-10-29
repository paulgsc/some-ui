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
  /** The requirement kind it instantiates (OA1–OA8, RE1–RE10). */
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

/**
 * What a kept table or store is: the owner's own history (`record`),
 * recomputable from records (`derived`), a copy of something held elsewhere
 * (`cache`), or measurements about the system (`telemetry`).
 */
type StoreClass = "record" | "derived" | "cache" | "telemetry"

/** One place data is kept, and the family that answers for its growth (RE9). */
type Store = {
  /** `server:<table>`, `mailbox:<table>` (the Worker's D1) or `phone:<store>`. */
  store: string
  class: StoreClass
  /** What it grows by, per what unit; or the bound that holds it constant. */
  growth: string
  /** What deletes from it, and when; absent when nothing does. */
  horizon?: string
  family: string
}

export type Ledger = {
  schema: typeof LEDGER_SCHEMA
  families: ReadonlyArray<Family>
  /** Every other server route module, and why it owes no later outcome. */
  synchronous: ReadonlyArray<{ module: string; why: string; decision?: string }>
  /** Every table and store the system keeps (STORAGE3, #2225). */
  stores: ReadonlyArray<Store>
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
const STORE_CLASSES: ReadonlyArray<StoreClass> = [
  "record",
  "derived",
  "cache",
  "telemetry",
]
const DAY = /^\d{4}-\d{2}-\d{2}$/

type Json = Record<string, unknown>
type At = (where: string, what: string) => void

/** Every key each object may carry: anything else is a typo or a new field. */
const KEYS = {
  root: ["schema", "families", "synchronous", "stores"],
  family: ["id", "name", "why", "paths", "modules", "objectives"],
  objective: [
    "id",
    "kind",
    "property",
    "claim",
    "requirement",
    "bound",
    "verdict",
    "conclusion",
    "evidence",
    "proof",
    "tracked",
    "watch",
    "comparison",
    "amendments",
    "retired",
  ],
  evidence: ["class", "says", "ref"],
  watch: ["by", "ref"],
  bound: ["value", "unit", "tighter"],
  comparison: ["what", "x", "y", "series", "limits"],
  series: ["label", "points"],
  amendment: ["on", "change", "why", "decision"],
  retired: ["on", "why"],
  synchronous: ["module", "why", "decision"],
  store: ["store", "class", "growth", "horizon", "family"],
} as const

/**
 * Read the ledger, or every way it is not one. A reader that stopped at the
 * first problem would hide the rest behind it (OA4, on itself).
 */
export function parseLedger(input: unknown): Parsed {
  const problems: Array<string> = []
  const ledger = build(input, (where, what) => {
    problems.push(`${where}: ${what}`)
  })
  return ledger && problems.length === 0
    ? { ok: true, ledger }
    : {
        ok: false,
        problems: ledger ? problems : ["the ledger is not an object"],
      }
}

/**
 * What a ledger says, as far as it can be read, problems aside: for the base
 * branch's copy, which an older (or newer) grammar wrote, so a change to the
 * grammar does not turn the ratchet against its own pull request.
 */
export function readLedgerLeniently(input: unknown): Ledger | null {
  return build(input, () => undefined)
}

function build(input: unknown, at: At): Ledger | null {
  const root = record(input)
  if (!root) return null
  keys(root, KEYS.root, "ledger", at)
  if (root.schema !== LEDGER_SCHEMA) at("schema", `expected "${LEDGER_SCHEMA}"`)

  const families = list(root.families, "families", at).flatMap((raw, i) => {
    const family = readFamily(raw, `families[${i}]`, at)
    return family ? [family] : []
  })
  const synchronous = list(root.synchronous, "synchronous", at).flatMap(
    (raw, i) => {
      const entry = record(raw)
      const where = `synchronous[${i}]`
      if (!entry || !text(entry.module) || !text(entry.why)) {
        at(where, "needs a module and why")
        return []
      }
      keys(entry, KEYS.synchronous, where, at)
      return [
        {
          module: entry.module,
          why: entry.why,
          ...(text(entry.decision) ? { decision: entry.decision } : {}),
        },
      ]
    }
  )
  const stores = list(root.stores, "stores", at).flatMap((raw, i) => {
    const entry = record(raw)
    const where = `stores[${i}]`
    const kind = oneOf(entry?.class, STORE_CLASSES)
    if (
      !entry ||
      !text(entry.store) ||
      !kind ||
      !text(entry.growth) ||
      !text(entry.family)
    ) {
      at(
        where,
        `needs a store, a class (${STORE_CLASSES.join(", ")}), growth and a family`
      )
      return []
    }
    keys(entry, KEYS.store, where, at)
    return [
      {
        store: entry.store,
        class: kind,
        growth: entry.growth,
        ...(text(entry.horizon) ? { horizon: entry.horizon } : {}),
        family: entry.family,
      },
    ]
  })
  return { schema: LEDGER_SCHEMA, families, synchronous, stores }
}

function readFamily(raw: unknown, where: string, at: At): Family | null {
  const family = record(raw)
  if (!family) {
    at(where, "is not an object")
    return null
  }
  keys(family, KEYS.family, where, at)
  for (const key of ["id", "name", "why"] as const) {
    if (!text(family[key])) at(where, `needs a ${key}`)
  }
  const objectives = list(family.objectives, `${where}.objectives`, at).flatMap(
    (o, i) => {
      const objective = readObjective(o, `${where}.objectives[${i}]`, at)
      return objective ? [objective] : []
    }
  )
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

function readObjective(raw: unknown, where: string, at: At): Objective | null {
  const o = record(raw)
  if (!o) {
    at(where, "is not an object")
    return null
  }
  const id = str(o.id)
  const here = id ? `${where} (${id})` : where
  keys(o, KEYS.objective, here, at)
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

  const evidence = list(o.evidence, `${here}.evidence`, at).flatMap((e, i) => {
    const item = record(e)
    if (item) keys(item, KEYS.evidence, `${here}.evidence[${i}]`, at)
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
  if (watch) keys(watch, KEYS.watch, `${here}.watch`, at)
  const by = oneOf(watch?.by, WATCHES)
  if (!by) at(here, `watch.by is one of ${WATCHES.join(", ")}`)

  const amendments = list(o.amendments, `${here}.amendments`, at).flatMap(
    (a, i) => {
      const item = record(a)
      if (item) keys(item, KEYS.amendment, `${here}.amendments[${i}]`, at)
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
    }
  )

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

function optionalBound(raw: unknown, where: string, at: At): { bound?: Bound } {
  if (raw === undefined) return {}
  const b = record(raw)
  if (b) keys(b, KEYS.bound, `${where}.bound`, at)
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
  at: At
): { comparison?: Comparison } {
  if (raw === undefined) return {}
  const c = record(raw)
  if (c) keys(c, KEYS.comparison, `${where}.comparison`, at)
  const series = list(c?.series, `${where}.comparison.series`, at).flatMap(
    (s, i) => {
      const item = record(s)
      if (item) keys(item, KEYS.series, `${where}.comparison.series[${i}]`, at)
      const points = list(
        item?.points,
        `${where}.comparison.series[${i}].points`,
        at
      ).flatMap((p, n) => {
        if (
          Array.isArray(p) &&
          p.length === 2 &&
          typeof p[0] === "number" &&
          typeof p[1] === "number"
        )
          return [[p[0], p[1]] as const]
        // A dropped point would quietly change what the page shows.
        at(
          `${where}.comparison.series[${i}].points[${n}]`,
          "is an [x, y] pair of numbers"
        )
        return []
      })
      if (!item || !text(item.label))
        at(`${where}.comparison.series[${i}]`, "needs a label")
      return item && text(item.label) && points.length > 0
        ? [{ label: item.label, points }]
        : []
    }
  )
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
  at: At
): { retired?: { on: string; why: string } } {
  if (raw === undefined) return {}
  const r = record(raw)
  if (r) keys(r, KEYS.retired, `${where}.retired`, at)
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

function list(value: unknown, where: string, at: At): ReadonlyArray<unknown> {
  if (Array.isArray(value)) return value
  at(where, "is a list")
  return []
}

function keys(
  value: Json,
  allowed: ReadonlyArray<string>,
  where: string,
  at: At
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) at(where, `has an unknown field "${key}"`)
  }
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function strings(value: unknown, where: string, at: At): ReadonlyArray<string> {
  if (!Array.isArray(value) || !value.every(text)) {
    at(where, "is a list of non-empty strings")
    return []
  }
  return value
}
