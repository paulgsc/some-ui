const REGISTERED_ID = /"((?:CW-P|M|A)\d+)"/g

/**
 * Every `CW-P`, `M` and `A` id appearing in a committed `generated.ts`'s
 * source text — cheap and reliable because the whole file is generated data
 * (every quoted `"CW-Pn"`, `"Mn"` or `"An"` in it is a real id, never
 * prose), so no typst parsing is needed to read it back.
 */
export function idsInGeneratedFile(
  generatedSource: string
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const match of generatedSource.matchAll(REGISTERED_ID)) {
    const id = match[1]
    if (id !== undefined) ids.add(id)
  }
  return ids
}

/**
 * Guards Amendment protocol rule 2 ("a retiring proposition is marked
 * retired and kept... a removal is a dangling citation") against this
 * generator itself: a canon edit that deletes a `#proposition(...)` block
 * outright — which the protocol forbids but nothing stops a human from
 * doing by mistake — produces a *shorter* but still contiguous
 * `CW-P1..CW-Pmax` sequence, which `parsePropositionRegister`'s own
 * contiguity check cannot distinguish from a register that never had the
 * missing id at all.
 * Comparing against the previously-committed ids is the only way to catch
 * a *removal* specifically, as opposed to a gap.
 *
 * Throws, rather than returning violations, because this runs during
 * generation itself — a caller that would otherwise commit a real
 * citation-anchor break needs to stop, not just be told about it.
 */
export function assertNoRegisteredIdWasRemoved(
  previouslyRegisteredIds: ReadonlySet<string>,
  entries: ReadonlyArray<{ readonly id: string }>
): void {
  const currentIds = new Set(entries.map((entry) => entry.id))
  const removed = [...previouslyRegisteredIds].filter(
    (id) => !currentIds.has(id)
  )
  if (removed.length > 0) {
    throw new Error(
      `regenerating the proposition register would remove ${removed.sort().join(", ")} — canon §7's and Rem. 7.4's ids are stable citation anchors (Amendment protocol rule 2) and must never be removed, only marked and kept. A retired §7 entry keeps its #proposition(...) with a " (retired)" suffix on its title; a superseded Rem. 7.4 row keeps its row with " (superseded)" after its rule.`
    )
  }
}
