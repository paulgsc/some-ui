/**
 * Every word `/assurance` says of its own (docs/operational-assurance.md,
 * "What `/assurance` shows"). Each promise's claim, requirement and
 * conclusion are the ledger's (`@some-ui/assurance`); these frame them, and
 * name no machinery (`./__tests__/words.test.ts`).
 */
import type { EvidenceClass, Verdict, WatchBy } from "@some-ui/assurance"

export const ASSURANCE_WORDS = {
  eyebrow: "Promises",
  title: "What my tools promise about outcomes and work, and how I know",
  lead: "Two things should hold everywhere: nothing fails without my hearing of it, and nothing does work it doesn't need. Each promise below says whether it holds, the evidence either way, and what would make it hold. Broken ones come first.",
  retired: "Retired",
  verdicts: {
    holds: "Holds",
    broken: "Broken",
    unproven: "Not yet shown",
  } satisfies Record<Verdict, string>,
  verdictLegend: {
    holds: "A test or check holds it, and fails if it stops holding",
    broken: "The evidence says it does not hold today",
    unproven: "Nothing shows it either way, so I count it as not holding",
  } satisfies Record<Verdict, string>,
  tallyLabel: "How many promises are in each state",
  limitsHeading: "What this page cannot see",
  live: "Whether each promise holds right now, on home. This page shows what was true of the code it was built from.",
  merges: {
    blocked: "A failing check stops a merge in both places.",
    open: "A failing check does not yet stop a merge. Until it does, these checks warn and nothing more.",
  },
  watching: (alerting: number, dashboardOnly: number): string => {
    const onDashboard = `${dashboardOnly} ${dashboardOnly === 1 ? "shows" : "show"}`
    return alerting === 0
      ? `None of these promises tells me when it breaks. ${onDashboard} on a dashboard I have to open.`
      : `${alerting} ${alerting === 1 ? "tells" : "tell"} me when it breaks; ${onDashboard} only on a dashboard I have to open.`
  },
  built: "Built from",
  builtUnknown: "Built from a copy whose commit is not known",
  requirement: "Exactly what it takes",
  bound: "The limit",
  evidenceHeading: "The evidence",
  evidenceClass: {
    measured: "Measured",
    structural: "Read from the code",
    derived: "Worked out",
    unknown: "Not known",
  } satisfies Record<EvidenceClass, string>,
  comparisonHeading: "Before and after",
  limits: "Where this stops applying",
  receiptHeading: "The receipt",
  proof: "What holds it",
  tracked: "What will make it hold",
  watchHeading: "Who would notice",
  watch: {
    none: "Nothing would tell me",
    dashboard: "A dashboard, if I open it",
    alert: "An alert reaches me",
  } satisfies Record<WatchBy, string>,
  amendmentsHeading: "Changes to what it promises",
  noAmendments: "Unchanged since it was written.",
  decided: "Decided here",
  source: "The whole record",
} as const
