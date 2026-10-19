/**
 * The retention state machine (#1950): `plan` decides what to delete from
 * what GitHub holds. The property test walks every history of five runs; the
 * cases pin what it cannot see (scopes, lineages, matching, caches).
 */

import {
  artifactFamily,
  artifactLineage,
  cacheFamily,
  cacheLineage,
  plan,
  type Artifact,
  type ArtifactFamily,
  type Cache,
  type CacheFamily,
  type Plan,
  type RunState,
  type State,
} from "@eslint/retention.js"
import { describe, expect, it } from "vitest"

const SHA = (n: number): string => n.toString(16).padStart(40, "0")

const APK: ArtifactFamily = {
  kind: "artifact",
  name: "apk-${{ github.sha }}",
  workflows: ["Mobile APK"],
  keep: 1,
  ttlDays: 30,
}
const TWO: ArtifactFamily = { ...APK, name: "two-${{ github.sha }}", keep: 2 }
const PAGES: ArtifactFamily = {
  kind: "artifact",
  name: "pages",
  workflows: ["Pages"],
  keep: 0,
  ttlDays: 1,
}

function artifact(name: string, runId: number, branch = "main"): Artifact {
  return { id: runId * 10, name, runId, branch, bytes: 1 }
}

function state(
  artifacts: ReadonlyArray<Artifact>,
  runs: ReadonlyArray<[number, RunState]>,
  caches: ReadonlyArray<Cache> = [],
  liveRefs: ReadonlyArray<string> = ["refs/heads/main"]
): State {
  return { artifacts, runs: new Map(runs), caches, liveRefs: new Set(liveRefs) }
}

function deletedIds(s: State, families = [APK, TWO, PAGES]): Array<number> {
  return plan(s, families, [])
    .deletions.map((d) => d.item.id)
    .sort((a, b) => a - b)
}

describe("artifact families", () => {
  it("abandons a failed generation only once a newer one is validated", () => {
    const failedFirst = state([artifact(`apk-${SHA(1)}`, 1)], [[1, "failed"]])
    expect(deletedIds(failedFirst)).toEqual([])

    const thenValidated = state(
      [artifact(`apk-${SHA(1)}`, 1), artifact(`apk-${SHA(2)}`, 2)],
      [
        [1, "failed"],
        [2, "validated"],
      ]
    )
    expect(plan(thenValidated, [APK], []).deletions).toEqual([
      expect.objectContaining({
        reason: "abandoned",
        item: thenValidated.artifacts[0],
      }),
    ])
  })

  it("keeps a failed generation newer than the newest validated (a re-run reads it)", () => {
    const s = state(
      [artifact(`apk-${SHA(1)}`, 1), artifact(`apk-${SHA(2)}`, 2)],
      [
        [1, "validated"],
        [2, "failed"],
      ]
    )
    expect(deletedIds(s)).toEqual([])
  })

  it("deletes a keep-0 artifact once its run is validated, and keeps a failed one for a re-run", () => {
    const s = state(
      [artifact("pages", 1), artifact("pages", 2), artifact("pages", 3)],
      [
        [1, "failed"],
        [2, "validated"],
        [3, "pending"],
      ]
    )
    expect(plan(s, [PAGES], []).deletions).toEqual([
      expect.objectContaining({ reason: "consumed", item: s.artifacts[1] }),
    ])
  })

  it("scopes generations per branch", () => {
    const s = state(
      [artifact(`apk-${SHA(1)}`, 1, "main"), artifact(`apk-${SHA(2)}`, 2, "x")],
      [
        [1, "validated"],
        [2, "validated"],
      ]
    )
    expect(deletedIds(s)).toEqual([])
  })

  it("scopes generations per lineage: the name less any commit SHA", () => {
    expect(artifactLineage(`apk-${SHA(7)}`)).toBe("apk-")
    expect(artifactLineage("signed-suspender-ledger")).toBe(
      "signed-suspender-ledger"
    )
    const signed: ArtifactFamily = {
      ...APK,
      name: "signed-${{ matrix.extension_name }}",
    }
    const s = state(
      [artifact("signed-a", 1), artifact("signed-b", 2)],
      [
        [1, "validated"],
        [2, "validated"],
      ]
    )
    expect(deletedIds(s, [signed])).toEqual([])
  })

  it("reports a name no family declares and never deletes it", () => {
    const s = state([artifact("mystery", 1)], [[1, "validated"]])
    const result = plan(s, [APK], [])
    expect(result.deletions).toEqual([])
    expect(result.undeclaredArtifacts).toEqual(s.artifacts)
  })

  it("matches a name to the family with the most literal text", () => {
    const launch: ArtifactFamily = {
      ...PAGES,
      name: "launch-${{ github.sha }}",
    }
    const launchApk: ArtifactFamily = {
      ...PAGES,
      name: "launch-apk-${{ github.sha }}",
    }
    expect(artifactFamily(`launch-apk-${SHA(1)}`, [launch, launchApk])).toBe(
      launchApk
    )
    expect(artifactFamily(`launch-${SHA(1)}`, [launch, launchApk])).toBe(launch)
  })
})

describe("artifact properties", () => {
  // Every reachable history of one lineage over runs 1..n: each run starts
  // pending and ends validated, failed or still pending, in order. A later
  // step only moves a run out of pending or adds a newer run.
  type Step = { runs: Array<[number, RunState]>; artifacts: Array<Artifact> }

  function* histories(
    n: number,
    nameOf: (run: number) => string
  ): Generator<Array<Step>> {
    const outcomes: Array<RunState> = ["validated", "failed", "pending"]
    for (let code = 0; code < outcomes.length ** n; code++) {
      const runs = new Map<number, RunState>()
      const artifacts: Array<Artifact> = []
      const steps: Array<Step> = []
      for (let run = 1; run <= n; run++) {
        runs.set(run, "pending")
        artifacts.push(artifact(nameOf(run), run))
        steps.push({ runs: [...runs], artifacts: [...artifacts] })
        const outcome = Math.floor(code / outcomes.length ** (run - 1)) % 3
        runs.set(run, outcomes[outcome] ?? "pending")
        steps.push({ runs: [...runs], artifacts: [...artifacts] })
      }
      yield steps
    }
  }

  const names: Array<[ArtifactFamily, (run: number) => string]> = [
    [APK, (run): string => `apk-${SHA(run)}`],
    [TWO, (run): string => `two-${SHA(run)}`],
    [PAGES, (): string => "pages"],
  ]
  for (const [family, nameOf] of names) {
    it(`${family.name}: deletions only grow, the newest validated survives, at most keep validated stay`, () => {
      for (const history of histories(5, nameOf)) {
        let previous = new Set<number>()
        for (const step of history) {
          const deleted = new Set(
            deletedIds(state(step.artifacts, step.runs), [family])
          )
          for (const id of previous) expect(deleted.has(id)).toBe(true)
          previous = deleted

          const states = new Map(step.runs)
          const validated = step.artifacts
            .filter((a) => states.get(a.runId) === "validated")
            .sort((a, b) => b.runId - a.runId)
          const newest = validated[0]
          if (family.keep > 0 && newest) {
            expect(deleted.has(newest.id)).toBe(false)
          }
          expect(
            validated.filter((a) => !deleted.has(a.id)).length
          ).toBeLessThanOrEqual(family.keep)
          for (const a of step.artifacts) {
            if (states.get(a.runId) === "pending") {
              expect(deleted.has(a.id)).toBe(false)
            }
          }
        }
      }
    })
  }
})

const PNPM: CacheFamily = {
  kind: "cache",
  label: "pnpm",
  prefix: "pnpm-",
  scope: "per-ref",
  keep: 1,
}
const NIX: CacheFamily = {
  kind: "cache",
  label: "nix",
  pattern: /^[0-9a-z]{32,52}\.(?:nar\.zstd|narinfo)-/,
  scope: "shared",
  keep: 1,
}
const POOL: CacheFamily = {
  kind: "cache",
  label: "docker",
  prefix: "buildkit-",
  scope: "pool",
  keep: 0,
}

let cacheId = 0
function cache(key: string, ref: string, createdAt: string): Cache {
  cacheId += 1
  return { id: cacheId, key, ref, createdAt, bytes: 1 }
}

const MAIN = "refs/heads/main"
const PR = "refs/pull/7/merge"
const NAR = `${"a".repeat(52)}.nar.zstd`

function cachePlan(caches: Array<Cache>, liveRefs = [MAIN, PR]): Plan {
  return plan(state([], [], caches, liveRefs), [], [PNPM, NIX, POOL])
}

describe("cache families", () => {
  it("per-ref: keeps the newest entry per lineage per ref", () => {
    const old = cache("pnpm-Linux-aaa", MAIN, "2026-10-01")
    const fresh = cache("pnpm-Linux-bbb", MAIN, "2026-10-02")
    const onPr = cache("pnpm-Linux-ccc", PR, "2026-10-01")
    expect(cachePlan([old, fresh, onPr]).deletions).toEqual([
      expect.objectContaining({ reason: "superseded", item: old }),
    ])
  })

  it("drops every entry on a ref that is no longer live, whatever its scope", () => {
    const gone = "refs/pull/3/merge"
    const caches = [
      cache("pnpm-Linux-aaa", gone, "2026-10-01"),
      cache(`${NAR}-abcd`, gone, "2026-10-01"),
      cache("buildkit-blob-1-sha256:1", gone, "2026-10-01"),
    ]
    expect(cachePlan(caches).deletions.map((d) => d.reason)).toEqual([
      "dead-ref",
      "dead-ref",
      "dead-ref",
    ])
  })

  it("shared: keeps main's newest copy and drops every other", () => {
    const mainCopy = cache(`${NAR}-aaaa`, MAIN, "2026-10-01")
    const mainDup = cache(`${NAR}-bbbb`, MAIN, "2026-10-02")
    const prCopy = cache(`${NAR}-cccc`, PR, "2026-10-03")
    const result = cachePlan([mainCopy, mainDup, prCopy])
    expect(new Set(result.deletions.map((d) => d.item))).toEqual(
      new Set([mainCopy, prCopy])
    )
    expect(result.deletions.every((d) => d.reason === "duplicate")).toBe(true)
  })

  it("shared: without a main copy, each ref keeps its own newest", () => {
    const other = "refs/pull/8/merge"
    const a = cache(`${NAR}-aaaa`, PR, "2026-10-01")
    const b = cache(`${NAR}-bbbb`, PR, "2026-10-02")
    const c = cache(`${NAR}-cccc`, other, "2026-10-01")
    expect(
      cachePlan([a, b, c], [MAIN, PR, other]).deletions.map((d) => d.item)
    ).toEqual([a])
  })

  it("pool: never prunes a live ref's entries", () => {
    const caches = [
      cache("buildkit-blob-1-sha256:1", MAIN, "2026-10-01"),
      cache("buildkit-blob-1-sha256:2", MAIN, "2026-10-02"),
    ]
    expect(cachePlan(caches).deletions).toEqual([])
  })

  it("reports a key no family declares and never deletes it", () => {
    const stray = cache("mystery-key", "refs/pull/99/merge", "2026-10-01")
    const result = cachePlan([stray])
    expect(result.deletions).toEqual([])
    expect(result.undeclaredCaches).toEqual([stray])
  })

  it("names a key's lineage and its family", () => {
    expect(cacheLineage("cargo-target-Linux-rust-abc")).toBe(
      "cargo-target-Linux-rust"
    )
    expect(cacheLineage(`${NAR}-zgPN`)).toBe(NAR)
    expect(cacheFamily("pnpm-Linux-1", [PNPM, NIX])).toBe(PNPM)
    expect(cacheFamily(`${NAR}-zgPN`, [PNPM, NIX])).toBe(NIX)
    expect(cacheFamily("buildkit-x", [PNPM, NIX])).toBeUndefined()
  })
})
