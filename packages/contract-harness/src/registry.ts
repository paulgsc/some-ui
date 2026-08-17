/**
 * @module registry
 *
 * Every contract the harness knows about, in one list.
 *
 * Contracts are enumerated explicitly rather than discovered by globbing the
 * directory. Globbing would mean a contract file that fails to load simply
 * vanishes from the run, and the report would show a smaller, entirely green
 * suite — the worst possible failure mode for a tool whose only job is to tell
 * you when something is missing.
 */

import { contracts as healthContracts } from "../contracts/health.contract"
import { contracts as studyNudgeContracts } from "../contracts/study-nudge.contract"
import { contracts as tabContracts } from "../contracts/tabs.contract"
import type { Contract } from "./contract"

export const allContracts: ReadonlyArray<Contract> = [
  ...healthContracts,
  ...studyNudgeContracts,
  ...tabContracts,
]

/** Fails loudly on duplicate ids — two contracts sharing one id would make the
 * report ambiguous and `--only` non-deterministic. */
export function assertUniqueIds(contracts: ReadonlyArray<Contract>): void {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const contract of contracts) {
    if (seen.has(contract.id)) duplicates.add(contract.id)
    seen.add(contract.id)
  }
  if (duplicates.size > 0) {
    throw new Error(`duplicate contract id(s): ${[...duplicates].join(", ")}`)
  }
}

/** Selects by exact contract id or by module name. */
export function selectContracts(
  contracts: ReadonlyArray<Contract>,
  selector: string | undefined
): ReadonlyArray<Contract> {
  if (selector === undefined || selector === "") return contracts
  const wanted = new Set(selector.split(",").map((part) => part.trim()))
  return contracts.filter(
    (contract) => wanted.has(contract.id) || wanted.has(contract.module)
  )
}
