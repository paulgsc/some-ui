import ledgerJson from "./ledger.json"
import { parseLedger } from "./ledger.ts"
import type { Ledger } from "./ledger.ts"

export type {
  Amendment,
  Bound,
  Check,
  CheckKind,
  CheckPlace,
  CheckStatus,
  Comparison,
  Evidence,
  EvidenceClass,
  Family,
  Ledger,
  Objective,
  Process,
  Property,
  Segment,
  SegmentOwner,
  SegmentPlace,
  Series,
  Signal,
  Verdict,
  Watch,
  WatchBy,
} from "./ledger.ts"

function read(): Ledger {
  const parsed = parseLedger(ledgerJson)
  // check:assurance fails a ledger this cannot read, so this is a build that
  // skipped it.
  if (!parsed.ok)
    throw new Error(
      `The assurance ledger is unreadable:\n${parsed.problems.join("\n")}`
    )
  return parsed.ledger
}

/** The ledger as this build was made from it. */
export const LEDGER: Ledger = read()
