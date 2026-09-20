/**
 * The admission rule, as a pure analysis over a built extension artifact.
 *
 * ── what this is ────────────────────────────────────────────────────────
 *
 * Every extension in this workspace ships content scripts against pages it
 * does not control. The sizes that decide how much work those scripts do —
 * node count `S_i`, depth `H_i`, arrival rate `A_i(t)`, tab count `N` — are
 * properties of whatever the user opened, not of this repository. An effect
 * whose cost scales with any of them can hang a tab, and the browser's
 * "Page unresponsive" dialog attributes that to the extension.
 *
 * So the rule is not "this extension's classifier is slow." It is: *for any
 * build B of any extension E, every page-affecting effect in B is declared,
 * and no declared effect scales with the page.* That statement mentions no
 * function, module or file, which is exactly why it lives in `common` and
 * takes the artifact and the ledger as parameters.
 *
 * ── why the built artifact ──────────────────────────────────────────────
 *
 * `dist/*.js` is what the browser runs. It already contains every imported
 * workspace package, npm dependency and generated string; a source scan
 * over one extension's `src/` sees none of that. Host property names
 * survive bundling and identifier mangling — `getComputedStyle` cannot be
 * renamed, because the bundler does not own that property — which is what
 * makes the artifact scannable at all. `assertScanIsNotBlind` below exists
 * because that premise is load-bearing: if a bundler change ever mangled
 * those names, every check here would pass by seeing nothing.
 *
 * ── the four conditions ─────────────────────────────────────────────────
 *
 *   1. **Closure** — every alphabet occurrence has a ledger entry.
 *   2. **Ratchet** — occurrence counts match the ledger.
 *   3. **Cost admission** — nothing declared `unbounded-per-dispatch`.
 *   4. **Retention admission** — nothing declared `unbounded`.
 *
 * Conditions 1 and 2 are what make the rule survive an arbitrary diff:
 * renaming a function, moving it to another module, rewriting a `while`
 * pump as `for…of`, or hiding it in an imported package changes which entry
 * is implicated, never whether one is.
 *
 * ── the honest limit ────────────────────────────────────────────────────
 *
 * Cost and retention classes are **declarations**, not proofs. Nothing here
 * verifies that an effect marked `budgeted` bounds its work; that needs a
 * runtime kernel enforcing a per-dispatch credit bound. A wrong declaration
 * is a lie this analysis will believe. The value of the rule is that it
 * concentrates that trust into one small reviewable file per extension, and
 * makes it impossible for an effect to enter the product without appearing
 * there at all.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"

import {
  scanBundle,
  tallyByEffect,
  type EffectOccurrence,
} from "./bundle-effect-scan"
import {
  ADMITTED_COST_CLASSES,
  ADMITTED_RETENTION_CLASSES,
} from "./effect-alphabet"
import type { EffectLedger } from "./ledger"

export type AdmissionOptions = {
  /** Absolute path to the extension's built artifact directory. */
  readonly distDir: string
  /** That extension's own declarations. */
  readonly ledger: EffectLedger
  /**
   * The bundle whose occurrence count backs the blindness check, and the
   * floor it must clear. Defaults to the busiest content script found.
   */
  readonly blindnessFloor?: number
}

export type AdmissionReport = {
  /** Whether a built artifact was found at all. */
  readonly built: boolean
  /** Page-facing bundles, derived from the built manifest. */
  readonly bundles: ReadonlyArray<string>
  /** Page-facing bundles with no ledger section. */
  readonly undeclaredBundles: ReadonlyArray<string>
  /** Ledger sections for bundles the manifest no longer ships. */
  readonly staleBundles: ReadonlyArray<string>
  /** Condition 1. */
  readonly unclassified: ReadonlyArray<string>
  /** Condition 2. */
  readonly ratchetDrift: ReadonlyArray<string>
  /** Condition 3. */
  readonly costViolations: ReadonlyArray<string>
  /** Condition 4. */
  readonly retentionViolations: ReadonlyArray<string>
  /** Largest per-bundle occurrence count, for the blindness check. */
  readonly peakOccurrences: number
  readonly occurrencesByBundle: ReadonlyMap<
    string,
    ReadonlyArray<EffectOccurrence>
  >
}

type Manifest = {
  readonly content_scripts?: ReadonlyArray<{
    readonly js?: ReadonlyArray<string>
  }>
  readonly background?: {
    readonly service_worker?: string
    readonly scripts?: ReadonlyArray<string>
  }
}

/**
 * Every JS bundle that executes against a page the user visited, derived
 * from the built manifest rather than listed: all content-script entries,
 * plus the background worker, which can inject into those pages via
 * `scripting`. MV2's `background.scripts` is read too so the derivation
 * does not silently miss a Firefox-targeted manifest.
 *
 * Deriving rather than listing is what stops a new content script being
 * admitted by omission. Extension-owned documents (popup, options, a debug
 * page) are excluded because their DOM is authored in this repository and
 * bounded by it — and they are excluded *by not appearing in the manifest's
 * page-facing entries*, not by a hardcoded filename list.
 */
export function pageFacingBundles(distDir: string): ReadonlyArray<string> {
  const parsed: unknown = JSON.parse(
    readFileSync(join(distDir, "manifest.json"), "utf8")
  )
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${distDir}/manifest.json is not an object`)
  }
  const manifest: Manifest = parsed

  const bundles = new Set<string>()
  for (const entry of manifest.content_scripts ?? []) {
    for (const js of entry.js ?? []) bundles.add(js)
  }
  const worker = manifest.background?.service_worker
  if (worker !== undefined) bundles.add(worker)
  for (const script of manifest.background?.scripts ?? []) bundles.add(script)
  return [...bundles].sort()
}

/** Runs the four conditions over a built artifact. Pure: no assertions, no test framework. */
export function analyzeAdmission(options: AdmissionOptions): AdmissionReport {
  const { distDir, ledger } = options

  if (!existsSync(join(distDir, "manifest.json"))) {
    return {
      built: false,
      bundles: [],
      undeclaredBundles: [],
      staleBundles: [],
      unclassified: [],
      ratchetDrift: [],
      costViolations: [],
      retentionViolations: [],
      peakOccurrences: 0,
      occurrencesByBundle: new Map(),
    }
  }

  const bundles = pageFacingBundles(distDir)
  const undeclaredBundles = bundles.filter((b) => !ledger.has(b))
  const staleBundles = [...ledger.keys()].filter((b) => !bundles.includes(b))

  const occurrencesByBundle = new Map<string, ReadonlyArray<EffectOccurrence>>()
  for (const bundle of bundles) {
    const path = join(distDir, bundle)
    if (existsSync(path)) occurrencesByBundle.set(bundle, scanBundle(path))
  }

  const unclassified: Array<string> = []
  const ratchetDrift: Array<string> = []

  for (const [bundle, occurrences] of occurrencesByBundle) {
    const declared = ledger.get(bundle)
    const tally = tallyByEffect(occurrences)

    for (const [effect, list] of tally) {
      if (declared?.has(effect) === true) continue
      const first = list[0]
      const where =
        first === undefined
          ? "(no occurrence recorded)"
          : `[${first.kind}] first at line ${String(first.line)}: ${first.context}`
      unclassified.push(`  ${bundle}: ${effect} x${list.length} ${where}`)
    }

    if (declared === undefined) continue
    for (const [effect, entry] of declared) {
      const actual = tally.get(effect)?.length ?? 0
      if (actual === entry.count) continue
      const direction =
        actual > entry.count
          ? "a new call site was added"
          : "a call site was removed"
      ratchetDrift.push(
        `  ${bundle}: ${effect} declared ${entry.count}, found ${actual} — ${direction}`
      )
    }
  }

  const costViolations: Array<string> = []
  const retentionViolations: Array<string> = []

  for (const [bundle, declared] of ledger) {
    for (const [effect, entry] of declared) {
      if (!ADMITTED_COST_CLASSES.has(entry.cost)) {
        costViolations.push(
          `  ${bundle}: ${effect} x${entry.count} — cost "${entry.cost}"\n` +
            `           owner: ${entry.owner}\n           ${entry.note}`
        )
      }
      if (!ADMITTED_RETENTION_CLASSES.has(entry.retention)) {
        retentionViolations.push(
          `  ${bundle}: ${effect} — retention "${entry.retention}"\n` +
            `           owner: ${entry.owner}\n           ${entry.note}`
        )
      }
    }
  }

  let peakOccurrences = 0
  for (const occurrences of occurrencesByBundle.values()) {
    peakOccurrences = Math.max(peakOccurrences, occurrences.length)
  }

  return {
    built: true,
    bundles,
    undeclaredBundles,
    staleBundles,
    unclassified,
    ratchetDrift,
    costViolations,
    retentionViolations,
    peakOccurrences,
    occurrencesByBundle,
  }
}
