/**
 * The admission rule as a ready-made vitest suite.
 *
 * Kept in its own entry point (`@some-extension/common/budgets/vitest`)
 * rather than in the barrel, so that `@some-extension/common/budgets` stays
 * a pure analysis library with no test-framework dependency. An extension
 * on a different runner can call `analyzeAdmission` and write its own
 * assertions; an extension on vitest gets the whole gate in three lines.
 */

import { describe, expect, it } from "vitest"

import { analyzeAdmission, type AdmissionOptions } from "./admission"

export type AdmissionGateOptions = AdmissionOptions & {
  /** Extension name, for assertion messages. */
  readonly extension: string
  /** Command that produces the artifact, quoted back when it is missing. */
  readonly buildCommand: string
}

/**
 * Registers the admission gate's cases. Call at module top level from a
 * `*.test.ts` in the extension.
 */
export function describeAdmissionGate(options: AdmissionGateOptions): void {
  const { extension, buildCommand, blindnessFloor = 20 } = options
  const report = analyzeAdmission(options)

  describe(`${extension} — shipped-artifact admission gate`, () => {
    it("has a built artifact to analyse", () => {
      // A gate that silently analyses nothing is the worst outcome, because
      // it is green. This case is what turns a missing build into a red.
      expect(
        report.built,
        `No built artifact at ${options.distDir}. The admission rule analyses ` +
          `the shipped bundle, not the source tree, so it cannot run without ` +
          `one. Run \`${buildCommand}\` first.`
      ).toBe(true)
    })

    it("derives its scope from the manifest, and every page-facing bundle is declared", () => {
      expect(
        report.undeclaredBundles,
        `\nThese bundles run against visited pages (per the built manifest) ` +
          `but have no ledger section:\n\n  ` +
          `${report.undeclaredBundles.join("\n  ")}\n\n` +
          `A new content script cannot be admitted by omission. Declare the ` +
          `cost and retention class of every effect it ships.\n`
      ).toEqual([])

      expect(
        report.staleBundles,
        `\nLedger declares bundles the manifest no longer ships: ` +
          `${report.staleBundles.join(", ")}. A stale declaration looks like ` +
          `coverage without being any.\n`
      ).toEqual([])
    })

    it("classifies every page-affecting effect in the artifact (closure, fail-closed)", () => {
      expect(
        report.unclassified,
        `\n${report.unclassified.length} page-affecting effect(s) reach the ` +
          `shipped artifact with no ledger entry:\n\n` +
          `${report.unclassified.join("\n")}\n\n` +
          `Closure is what makes this rule survive an arbitrary diff: the ` +
          `bundle already contains every imported workspace package, npm ` +
          `dependency and generated string, so an effect cannot enter the ` +
          `product without appearing here. An occurrence reported as ` +
          `<computed-member-access> is a non-literal property access that ` +
          `could resolve to any primitive at runtime; it is counted rather ` +
          `than understood, and the count is what the ratchet holds.\n`
      ).toEqual([])
    })

    it("holds the occurrence ratchet (a new call site must be declared)", () => {
      expect(
        report.ratchetDrift,
        `\nOccurrence counts drifted from the ledger:\n\n` +
          `${report.ratchetDrift.join("\n")}\n\n` +
          `This is deliberate friction. A new call site of an already-admitted ` +
          `primitive is exactly how a bounded effect becomes an unbounded one ` +
          `without any new primitive appearing, so it has to be declared. ` +
          `Say in the entry's note why the new site keeps its cost class true.\n`
      ).toEqual([])
    })

    it("admits no effect whose declared cost scales with the page", () => {
      expect(
        report.costViolations,
        `\n${report.costViolations.length} effect(s) declared with an ` +
          `inadmissible cost class:\n\n${report.costViolations.join("\n\n")}\n\n` +
          `"unbounded-per-dispatch" means the work done in one uninterruptible ` +
          `task scales with S_i (nodes) or H_i (depth) — quantities the visited ` +
          `page controls and this repository does not. The remedy is not to ` +
          `relabel the entry: it is to route the effect through a budgeted, ` +
          `resumable dispatch so that "budgeted" becomes true of it.\n`
      ).toEqual([])
    })

    it("admits no effect whose declared retention scales with the page", () => {
      expect(
        report.retentionViolations,
        `\n${report.retentionViolations.length} effect(s) retain state ` +
          `proportional to the page:\n\n` +
          `${report.retentionViolations.join("\n\n")}\n\n` +
          `Retention composes across tabs: O(S_i) per tab is O(sum of S_i) on ` +
          `the device, which no per-tab budget bounds.\n`
      ).toEqual([])
    })

    it("keeps the scan's own premise true: host primitives survive bundling", () => {
      // The whole scan rests on host property names being unmangleable. If a
      // bundler change ever minified them away, every case above would pass
      // by seeing nothing — the silent-green failure mode.
      expect(
        report.peakOccurrences,
        `The busiest page-facing bundle yielded ${report.peakOccurrences} ` +
          `effect occurrences, below the floor of ${blindnessFloor}. That ` +
          `most likely means the build now mangles or rewrites host property ` +
          `names and the scan has gone blind, rather than that the code ` +
          `improved — in which case every other case here is passing ` +
          `vacuously. Confirm against the bundle before lowering this floor.`
      ).toBeGreaterThanOrEqual(blindnessFloor)
    })
  })
}
