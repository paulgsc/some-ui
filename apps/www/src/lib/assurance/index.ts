/**
 * The `/assurance` page's model (docs/operational-assurance.md, "What
 * `/assurance` shows"): the ledger as this build was made from it, ordered so
 * what is broken comes first, with every reference turned into a link a
 * reader can open. Pure; the page only lays it out.
 */
import type {
  Evidence,
  Family,
  Ledger,
  Objective,
  Verdict,
} from "@some-ui/assurance"

const REPOS = {
  "some-ui": "https://github.com/paulgsc/some-ui",
  server: "https://github.com/paulgsc/server",
} as const

/** Worst first: a reader who stops after the first row has seen the gap. */
const ORDER: Record<Verdict, number> = { broken: 0, unproven: 1, holds: 2 }

export type Link = { label: string; href: string }

export type Row = {
  objective: Objective
  proofs: ReadonlyArray<Link>
  tracked: Link | null
  evidence: ReadonlyArray<{ item: Evidence; link: Link | null }>
  watch: Link | null
}

type FamilyView = {
  family: Family
  /** Its least-held verdict, which places the family on the page. */
  worst: Verdict
  rows: ReadonlyArray<Row>
}

export type AssurancePage = {
  /** Counts per verdict, over the promises still in force. Never one score. */
  tally: Record<Verdict, number>
  families: ReadonlyArray<FamilyView>
  /** Whether a failing check can stop a merge yet (GC1). */
  mergesBlocked: boolean
  /** In-force promises that would tell the owner if they broke. */
  alerting: number
  /** In-force promises only a dashboard someone opens would show. */
  dashboardOnly: number
  /** The commit this page was built from, and where to read it. */
  built: Link | null
}

/**
 * A ledger reference as a link: `some-ui:path#name` opens at the commit this
 * page was built from (main when unknown), `server:` at the server's main,
 * `some-ui#N` and `server#N` their issue, a URL itself.
 */
export function linkOf(ref: string, commit: string): Link | null {
  const issue = /^(some-ui|server)#(\d+)$/.exec(ref)
  if (issue) {
    return { label: ref, href: `${repoOf(issue[1])}/issues/${issue[2]}` }
  }
  const path = /^(some-ui|server):([^#]+)(?:#(.+))?$/.exec(ref)
  if (path) {
    const at = path[1] === "some-ui" && commit ? commit : "main"
    const file = path[2]
    return {
      label: path[3] ? `${file} · ${path[3]}` : file,
      href: `${repoOf(path[1])}/blob/${at}/${file}`,
    }
  }
  return ref.startsWith("https://") ? { label: ref, href: ref } : null
}

function repoOf(name: string | undefined): string {
  return name === "server" ? REPOS.server : REPOS["some-ui"]
}

function rowOf(objective: Objective, commit: string): Row {
  const link = (ref: string | undefined): Link | null =>
    ref === undefined ? null : linkOf(ref, commit)
  return {
    objective,
    proofs: (objective.proof ?? []).flatMap((p) => {
      const l = link(p)
      return l ? [l] : []
    }),
    tracked: link(objective.tracked),
    evidence: objective.evidence.map((e) => ({ item: e, link: link(e.ref) })),
    watch: link(objective.watch.ref),
  }
}

export function assurancePageOf(ledger: Ledger, commit: string): AssurancePage {
  const tally: Record<Verdict, number> = { broken: 0, unproven: 0, holds: 0 }
  let alerting = 0
  let dashboardOnly = 0
  let mergesBlocked = false
  const families = ledger.families.map((family): FamilyView => {
    const live = family.objectives.filter((o) => !o.retired)
    for (const o of live) {
      tally[o.verdict] += 1
      if (o.watch.by === "alert") alerting += 1
      if (o.watch.by === "dashboard") dashboardOnly += 1
      if (o.id === "GC1") mergesBlocked = o.verdict === "holds"
    }
    const rows = [...live]
      .sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict])
      .map((o) => rowOf(o, commit))
    const worst = rows[0]?.objective.verdict ?? "holds"
    return { family, worst, rows }
  })
  families.sort((a, b) => ORDER[a.worst] - ORDER[b.worst])
  return {
    tally,
    families,
    mergesBlocked,
    alerting,
    dashboardOnly,
    built: commit
      ? {
          label: commit.slice(0, 7),
          href: `${REPOS["some-ui"]}/commit/${commit}`,
        }
      : null,
  }
}
