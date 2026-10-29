/**
 * What `pnpm check:assurance` holds (docs/operational-assurance.md, "What
 * `pnpm check:assurance` holds"), as pure functions over the parsed ledger.
 * The script supplies what they cannot see themselves: the tracked files,
 * the server's route modules, the IDs the markdown already declares, and the
 * base branch's ledger.
 */
import type { Bound, Ledger, Objective, WatchBy } from "./ledger.ts"

/** An error fails the check; a warning is printed and passes. */
export type Finding = {
  id: string
  message: string
  level: "error" | "warning"
}

/** What the ledger's checks need from outside it. */
export type Surroundings = {
  /** Whether `path` is a tracked file in this repository. */
  isFile: (path: string) => boolean
  /** Whether `path` is a tracked file or a directory holding one. */
  exists: (path: string) => boolean
  /** Whether the tracked file at `path` contains `text`. */
  contains: (path: string, text: string) => boolean
  /** Every module the server serves a route from (routes.server.json). */
  routeModules: ReadonlyArray<string>
  /** IDs an invariant already declares in a markdown file. */
  declaredIds: ReadonlySet<string>
  /**
   * The tables the mailbox's D1 migrations and the phone's schema leave
   * standing (`tablesLeft`), each of which a store lists (STORAGE5). The
   * mailbox keeps nothing else, so its stores are exactly these; the phone
   * also keeps audio and records outside its database.
   */
  keptTables: { mailbox: ReadonlyArray<string>; phone: ReadonlyArray<string> }
}

const ID = /^[A-Z]{1,4}\d+$/
const KIND = /^(OA[1-8]|RE([1-9]|10))$/
const ISSUE = /^(some-ui|server)#\d+$/
/** A file and a name in it: a test's title, a function, a promise's ID. */
const PROOF = /^(some-ui|server):([^#\s]+)#(.{3,})$/
/** Where the owner decided: an issue, a pull request, or a comment on one. */
const DECISION =
  /^https:\/\/github\.com\/paulgsc\/(some-ui|server)\/(issues|pull)\/\d+(#[\w-]+)?$/
const LEDGER = "ledger"
const STORE = /^(server|mailbox|phone):[a-z0-9][a-z0-9_.-]*$/
const WATCH_ORDER: Record<WatchBy, number> = { none: 0, dashboard: 1, alert: 2 }

/** The ledger on its own: shape beyond parsing, proofs, issues, coverage. */
export function findLedgerViolations(
  ledger: Ledger,
  around: Surroundings
): ReadonlyArray<Finding> {
  const findings: Array<Finding> = []
  const flag = (id: string, message: string): void => {
    findings.push({ id, message, level: "error" })
  }
  const somePath = (
    id: string,
    what: string,
    ref: string | undefined
  ): void => {
    if (!ref?.startsWith("some-ui:")) return
    const path = ref.slice("some-ui:".length).split("#")[0] ?? ""
    if (!around.exists(path)) flag(id, `${what} ${path} does not exist`)
  }

  const seen = new Set<string>()
  const familyIds = new Set<string>()
  for (const family of ledger.families) {
    if (familyIds.has(family.id)) flag(family.id, "family id is used twice")
    familyIds.add(family.id)
    for (const path of family.paths) somePath(family.id, "path", path)
    for (const o of family.objectives) {
      if (!ID.test(o.id))
        flag(o.id, "an ID is an area prefix and a number, like MI1")
      if (seen.has(o.id)) flag(o.id, "ID is used twice")
      seen.add(o.id)
      if (around.declaredIds.has(o.id))
        flag(o.id, "ID is already an invariant declared in a markdown file")
      if (!KIND.test(o.kind))
        flag(o.id, `kind "${o.kind}" is not one of OA1–OA8, RE1–RE10`)
      for (const f of proofOrIssue(o, around)) flag(o.id, f)
      for (const e of o.evidence) somePath(o.id, "evidence", e.ref)
      somePath(o.id, "watch", o.watch.ref)
      for (const a of o.amendments) {
        if (!DECISION.test(a.decision))
          flag(
            o.id,
            `amendment of ${a.on}: decision is a link to where the owner decided`
          )
      }
    }
  }
  for (const entry of ledger.synchronous) {
    if (entry.decision !== undefined && !DECISION.test(entry.decision))
      flag(entry.module, "decision is a link to where the owner decided")
  }

  // RE9: whatever is kept is answered for by a family that states its growth.
  const stores = new Set<string>()
  const keeping = new Set<string>()
  for (const entry of ledger.stores) {
    if (!STORE.test(entry.store))
      flag(
        entry.store,
        "a store is server:, mailbox: or phone: and a lowercase name"
      )
    if (stores.has(entry.store)) flag(entry.store, "store is listed twice")
    stores.add(entry.store)
    if (!familyIds.has(entry.family))
      flag(entry.store, `family "${entry.family}" is not a family here`)
    keeping.add(entry.family)
  }
  for (const [place, tables] of Object.entries(around.keptTables)) {
    for (const table of tables) {
      if (!stores.has(`${place}:${table}`))
        flag(
          `${place}:${table}`,
          `a ${place} table no store lists: add it to the ledger's stores with its class, growth and family`
        )
    }
  }
  const mailbox = new Set(around.keptTables.mailbox)
  for (const { store } of ledger.stores) {
    if (
      store.startsWith("mailbox:") &&
      !mailbox.has(store.slice("mailbox:".length))
    )
      flag(store, "no mailbox migration leaves this table standing")
  }
  for (const family of ledger.families) {
    const states = family.objectives.some(
      (o) => o.kind === "RE9" && o.retired === undefined
    )
    if (keeping.has(family.id) && !states)
      flag(
        family.id,
        "keeps data, so it has an RE9 objective stating how it grows"
      )
  }

  const owners = new Map<string, string>()
  const place = (module: string, by: string): void => {
    const other = owners.get(module)
    if (other) flag(LEDGER, `module "${module}" is in both ${other} and ${by}`)
    owners.set(module, by)
  }
  for (const family of ledger.families) {
    for (const module of family.modules) place(module, family.id)
  }
  for (const entry of ledger.synchronous) place(entry.module, "synchronous")
  const served = new Set(around.routeModules)
  for (const module of served) {
    if (!owners.has(module))
      flag(
        LEDGER,
        `server module "${module}" is in no family and not in synchronous (OA1)`
      )
  }
  // Placed ahead of the snapshot that brings it, so the snapshot's own pull
  // request is green; once the server stops serving one, it is stale.
  for (const module of owners.keys()) {
    if (!served.has(module))
      findings.push({
        id: LEDGER,
        message: `module "${module}" is not one the server serves (yet, or any more)`,
        level: "warning",
      })
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
      const match = PROOF.exec(proof)
      if (!match) {
        out.push(
          `proof "${proof}" is some-ui:<file>#<name> or server:<file>#<name>, the name at least 3 characters`
        )
        continue
      }
      // Server paths wait for the server's own check (server#526).
      if (match[1] !== "some-ui") continue
      const path = match[2] ?? ""
      const name = match[3] ?? ""
      if (!around.isFile(path)) out.push(`proof ${path} is not a tracked file`)
      else if (!around.contains(path, name))
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
 * The tables a run of SQL migrations leaves standing, in order: `CREATE
 * [VIRTUAL] TABLE` adds one (a `TEMP` table is no store), `DROP TABLE`
 * removes it, `ALTER TABLE … RENAME TO` renames it. Strings and comments
 * (`--`, `//`, `/* … *\/`) are blanked in one leftmost pass first, so neither
 * prose nor a `GLOB 'image/*'` reads as SQL. Names are lower-cased, as SQLite
 * compares them, and a schema prefix (`main.`) is dropped.
 */
export function tablesLeft(sql: string): Array<string> {
  const code = sql.replace(
    /'(?:[^']|'')*'|--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match) => (match.startsWith("'") ? "''" : " ")
  )
  const name = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|\w+)`
  const qualified = String.raw`(?:${name}\s*\.\s*)?(${name})`
  const statement = new RegExp(
    String.raw`\b(CREATE\s+(?:(TEMP|TEMPORARY)\s+)?(?:VIRTUAL\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|ALTER\s+TABLE)\s+${qualified}(?:\s+RENAME\s+TO\s+${qualified})?`,
    "gi"
  )
  const bare = (raw: string): string =>
    raw.replace(/^["`[]|["`\]]$/g, "").toLowerCase()
  const tables = new Set<string>()
  for (const [, verb = "", temp, table = "", renamed] of code.matchAll(
    statement
  )) {
    const what = verb.toUpperCase()
    if (what.startsWith("CREATE")) {
      if (temp === undefined) tables.add(bare(table))
    } else if (what.startsWith("DROP")) tables.delete(bare(table))
    else if (renamed !== undefined) {
      tables.delete(bare(table))
      tables.add(bare(renamed))
    }
  }
  return [...tables]
}

/**
 * The ratchet against the base branch's ledger: what may change about an
 * objective only with a new amendment on it, what may never change, and a
 * route module that leaves a family only with the owner's decision.
 */
export function findRatchetViolations(
  base: Ledger,
  head: Ledger
): ReadonlyArray<Finding> {
  const findings: Array<Finding> = []
  const flag = (id: string, message: string): void => {
    findings.push({ id, message, level: "error" })
  }
  const headById = new Map(objectives(head).map((o) => [o.id, o]))
  for (const before of objectives(base)) {
    const after = headById.get(before.id)
    if (!after) {
      flag(
        before.id,
        "was removed; an objective retires instead, with an amendment"
      )
      continue
    }
    const kept = before.amendments.every(
      (a, i) => JSON.stringify(a) === JSON.stringify(after.amendments[i])
    )
    if (!kept)
      flag(
        before.id,
        "rewrote or removed an amendment; amendments are only appended"
      )
    if (before.retired && !after.retired)
      flag(before.id, "a retired objective stays retired")
    const amended = after.amendments.length > before.amendments.length
    const changes = weakenings(before, after)
    if (changes.length > 0 && !amended) {
      flag(
        before.id,
        `${changes.join("; ")}: that needs a new amendment on ${before.id}, with the owner's decision`
      )
    }
  }

  const familyOf = new Map(
    base.families.flatMap((f) => f.modules.map((m) => [m, f.id] as const))
  )
  for (const entry of head.synchronous) {
    const from = familyOf.get(entry.module)
    if (from && entry.decision === undefined)
      flag(
        entry.module,
        `left family ${from} for synchronous: that needs a decision on its synchronous entry`
      )
  }
  return findings
}

function weakenings(before: Objective, after: Objective): Array<string> {
  const out: Array<string> = []
  if (before.verdict === "holds" && after.verdict !== "holds")
    out.push(`its verdict went from holds to ${after.verdict}`)
  if (before.claim !== after.claim) out.push("its claim changed")
  if (before.requirement !== after.requirement)
    out.push("its requirement changed")
  if (before.kind !== after.kind) out.push("its kind changed")
  if (before.property !== after.property) out.push("its property changed")
  if (WATCH_ORDER[after.watch.by] < WATCH_ORDER[before.watch.by])
    out.push(`its watch went from ${before.watch.by} to ${after.watch.by}`)
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
