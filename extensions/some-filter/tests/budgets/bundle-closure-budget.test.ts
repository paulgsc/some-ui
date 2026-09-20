/**
 * The admission gate: a general resource rule over the *shipped artifact*.
 *
 * Read `tests/budgets/README.md` first — in particular "What is proved and
 * what is declared", which states exactly how strong the claim below is.
 *
 * ── what makes this a rule rather than a recognition ─────────────────────
 *
 * This file names no function, module or selector belonging to this
 * extension. It reads the built bundles, classifies every page-affecting
 * primitive in them against a fixed alphabet, and requires each to be
 * declared admissible in `effect-ledger.ts`. The known-bad head fails it
 * because two ledger entries declare `unbounded-per-dispatch`, not because
 * `scan()` or `auditLegibility()` appear anywhere in this directory.
 *
 * The test that this is a rule and not a denylist is G-4 of the relay:
 * take the current implementation, rename every function, move it to a new
 * module, rewrite the `while` pump as `for…of` over `querySelectorAll`, and
 * the gate must still be red. It is — the bundle still contains the same
 * primitives, and the ledger still declares them unbounded. Conversely,
 * deleting the offending code and reintroducing an equivalent unbounded
 * walk somewhere new raises an occurrence count past its declared value,
 * which is also red.
 *
 * ── the page-facing bundle set is derived, not listed ────────────────────
 *
 * `pageFacingBundles()` reads the built manifest. Moving an unbounded walk
 * into a new content script, or adding one, extends the set automatically
 * and the new bundle has no ledger section — fail closed. Extension-owned
 * documents (popup, debug) are excluded because their DOM is authored here;
 * that exclusion is derived from the same manifest rather than hardcoded.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import {
  scanBundle,
  tallyByEffect,
  type EffectOccurrence,
} from "./bundle-effect-scan"
import {
  ADMITTED_COST_CLASSES,
  ADMITTED_RETENTION_CLASSES,
} from "./effect-alphabet"
import { EFFECT_LEDGER } from "./effect-ledger"

const DIST = join(import.meta.dirname, "..", "..", "dist")

type Manifest = {
  readonly content_scripts?: ReadonlyArray<{
    readonly js?: ReadonlyArray<string>
  }>
  readonly background?: { readonly service_worker?: string }
}

/**
 * Every JS bundle that executes against a page the user visited, derived
 * from the built manifest: all content-script entries, plus the background
 * service worker (which injects CSS into those pages via `scripting`).
 */
function pageFacingBundles(): ReadonlyArray<string> {
  // `JSON.parse` returns `any`; narrowing by hand rather than asserting
  // keeps the repo's no-type-assertions rule and, more usefully, makes a
  // manifest shape this function does not understand fail loudly instead of
  // silently yielding an empty bundle set — which would be a green gate.
  const parsed: unknown = JSON.parse(
    readFileSync(join(DIST, "manifest.json"), "utf8")
  )
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("built manifest.json is not an object")
  }
  const manifest: Manifest = parsed

  const bundles = new Set<string>()
  for (const entry of manifest.content_scripts ?? []) {
    for (const js of entry.js ?? []) bundles.add(js)
  }
  const worker = manifest.background?.service_worker
  if (worker !== undefined) bundles.add(worker)
  return [...bundles].sort()
}

const distBuilt = existsSync(join(DIST, "manifest.json"))

describe("shipped-artifact admission gate", () => {
  it("has a built artifact to analyse", () => {
    // A gate that silently analyses nothing is the worst possible outcome —
    // it is green. `pnpm build:chromium` must have run first; CI runs it in
    // the same step. This case is what turns a missing build into a red.
    expect(
      distBuilt,
      `No built artifact at ${DIST}. The admission gate analyses the shipped ` +
        `bundle, not the source tree, so it cannot run without one. Run ` +
        `\`pnpm --filter @some-extension/filter build:chromium\` first.`
    ).toBe(true)
  })

  const bundles = distBuilt ? pageFacingBundles() : []

  it("derives its scope from the manifest, and every page-facing bundle is in the ledger", () => {
    const undeclared = bundles.filter((b) => !EFFECT_LEDGER.has(b))

    expect(
      undeclared,
      `\nThese bundles run against visited pages (per the built manifest) but ` +
        `have no section in effect-ledger.ts:\n\n  ${undeclared.join("\n  ")}\n\n` +
        `A new content script cannot be admitted by omission. Add a ledger ` +
        `section declaring the cost and retention class of every effect it ships.\n`
    ).toEqual([])

    // And the converse: a ledger section for a bundle that no longer ships
    // is stale, and would let a stale declaration look like coverage.
    const stale = [...EFFECT_LEDGER.keys()].filter((b) => !bundles.includes(b))
    expect(
      stale,
      `\nLedger declares bundles the manifest no longer ships: ${stale.join(", ")}\n`
    ).toEqual([])
  })

  const occurrencesByBundle = new Map<string, ReadonlyArray<EffectOccurrence>>()
  for (const bundle of bundles) {
    const path = join(DIST, bundle)
    if (existsSync(path)) occurrencesByBundle.set(bundle, scanBundle(path))
  }

  it("classifies every page-affecting effect in the artifact (closure, fail-closed)", () => {
    const unclassified: Array<string> = []

    for (const [bundle, occurrences] of occurrencesByBundle) {
      const declared = EFFECT_LEDGER.get(bundle)
      for (const [effect, list] of tallyByEffect(occurrences)) {
        if (declared?.has(effect) === true) continue
        const first = list[0]
        const where =
          first === undefined
            ? "(no occurrence recorded)"
            : `[${first.kind}] first at line ${String(first.line)}: ${first.context}`
        unclassified.push(`  ${bundle}: ${effect} x${list.length} ${where}`)
      }
    }

    expect(
      unclassified,
      `\n${unclassified.length} page-affecting effect(s) reach the shipped ` +
        `artifact with no ledger entry:\n\n${unclassified.join("\n")}\n\n` +
        `Closure is the property that makes this gate survive an arbitrary ` +
        `diff: the bundle already contains every imported workspace package, ` +
        `npm dependency and generated string, so an effect cannot enter the ` +
        `product without appearing here. An occurrence reported as ` +
        `<dynamic-member-access> is a computed access on a host object that ` +
        `could resolve to any primitive at runtime, and is never admissible — ` +
        `rewrite it as a static access so it can be classified.\n`
    ).toEqual([])
  })

  it("holds the occurrence ratchet (a new call site must be declared)", () => {
    const drifted: Array<string> = []

    for (const [bundle, occurrences] of occurrencesByBundle) {
      const declared = EFFECT_LEDGER.get(bundle)
      if (declared === undefined) continue
      const tally = tallyByEffect(occurrences)
      for (const [effect, entry] of declared) {
        const actual = tally.get(effect)?.length ?? 0
        if (actual !== entry.count) {
          const direction =
            actual > entry.count
              ? "a new call site was added"
              : "a call site was removed"
          drifted.push(
            `  ${bundle}: ${effect} declared ${entry.count}, found ${actual} — ${direction}`
          )
        }
      }
    }

    expect(
      drifted,
      `\nOccurrence counts drifted from the ledger:\n\n${drifted.join("\n")}\n\n` +
        `This is deliberate friction. A new call site of an already-admitted ` +
        `primitive is exactly how a bounded effect becomes an unbounded one ` +
        `without any new primitive appearing, so it has to be declared. ` +
        `Update effect-ledger.ts and say in the entry's note why the new site ` +
        `keeps the declared cost class true.\n`
    ).toEqual([])
  })

  it("admits no effect whose declared cost scales with the page", () => {
    const violations: Array<string> = []

    for (const [bundle, declared] of EFFECT_LEDGER) {
      for (const [effect, entry] of declared) {
        if (ADMITTED_COST_CLASSES.has(entry.cost)) continue
        violations.push(
          `  ${bundle}: ${effect} x${entry.count} — cost "${entry.cost}"\n` +
            `           owner: ${entry.owner}\n` +
            `           ${entry.note}`
        )
      }
    }

    expect(
      violations,
      `\n${violations.length} effect(s) declared with an inadmissible cost ` +
        `class:\n\n${violations.join("\n\n")}\n\n` +
        `"unbounded-per-dispatch" means the work done in one uninterruptible ` +
        `task scales with S_i (nodes) or H_i (depth) — quantities the visited ` +
        `page controls and this repository does not. The remedy is not to ` +
        `relabel the entry: it is to route the effect through a budgeted, ` +
        `resumable dispatch so that "budgeted" becomes true of it.\n`
    ).toEqual([])
  })

  it("admits no effect whose declared retention scales with the page", () => {
    const violations: Array<string> = []

    for (const [bundle, declared] of EFFECT_LEDGER) {
      for (const [effect, entry] of declared) {
        if (ADMITTED_RETENTION_CLASSES.has(entry.retention)) continue
        violations.push(
          `  ${bundle}: ${effect} — retention "${entry.retention}"\n` +
            `           owner: ${entry.owner}\n           ${entry.note}`
        )
      }
    }

    expect(
      violations,
      `\n${violations.length} effect(s) retain state proportional to the page:` +
        `\n\n${violations.join("\n\n")}\n\n` +
        `Retention composes across tabs: O(S_i) per tab is O(Σ S_i) on the ` +
        `device, which no per-tab budget bounds.\n`
    ).toEqual([])
  })

  it("keeps the scan's own premise true: host primitives survive bundling", () => {
    // The whole scan rests on host property names being unmangleable. If a
    // bundler change ever minified them away, every case above would pass
    // by seeing nothing — the silent-green failure mode. `getComputedStyle`
    // is known to be present in the content script's source; if it stops
    // appearing in the built bundle, the scan has gone blind rather than
    // the code having improved.
    const content = occurrencesByBundle.get("content.js") ?? []
    expect(
      content.length,
      `The content script bundle yielded ${content.length} effect occurrences. ` +
        `Near-zero means the scan has gone blind — most likely the build now ` +
        `mangles or otherwise rewrites host property names, which would make ` +
        `every other case in this file pass vacuously.`
    ).toBeGreaterThan(20)
  })
})
