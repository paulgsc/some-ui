// Retention (CLAUDE.md, "Workflow storage"; #1950): the one state machine
// for every artifact and Actions cache, each family below an instance of it.
// `plan` maps what GitHub holds to what to delete; scripts/retention.ts feeds
// it from retention.yml, and workflow-guards.ts fails an upload or cache no
// family declares.
//
// An artifact generation is one run's upload: pending while the run runs or
// waits, validated once it succeeds, failed otherwise. Per family, lineage
// (the name less any commit SHA) and branch, the newest `keep` validated are
// kept, older validated ones are superseded, and pending ones are never
// touched. A failed one older than the newest validated is abandoned when the
// family keeps copies; with `keep: 0` (consumed inside its run) it waits out
// its TTL, so "Re-run failed jobs" still finds it.
//
// Only generations older than a validated one are deleted, so while no run is
// re-run a newer state's deletions contain an older one's and overlapping
// sweeps cannot downgrade. A re-run that fails a validated run resets it.
//
// Cache scopes: `per-ref` keeps the newest `keep` per lineage (the key less
// its last `-` segment) per ref; `shared` (content-addressed, the Nix store)
// keeps one copy across refs, `main`'s when it has one, since every PR reads
// main's caches; `pool` (Docker's layer blobs) is never pruned by age. Every
// scope drops a ref that is no longer live. Undeclared names and keys are
// reported, never deleted.

export type ArtifactFamily = {
  readonly kind: "artifact"
  // The upload step's `name:` as written, `${{ }}` expressions included.
  readonly name: string
  // The `name:` of each workflow whose runs upload it (a reusable workflow
  // uploads under its caller's name).
  readonly workflows: ReadonlyArray<string>
  readonly keep: number
  // Equals the upload step's `retention-days`.
  readonly ttlDays: number
}

export type CacheFamily = {
  readonly kind: "cache"
  readonly label: string
  // The literal start of every key in the family; `pattern` instead where the
  // key starts with content (Nix store paths).
  readonly prefix?: string
  readonly pattern?: RegExp
  readonly scope: "per-ref" | "shared" | "pool"
  readonly keep: number
}

const MOBILE = ["Mobile APK"]
const SIGNING = ["Extension Release", "Sign Firefox Extension (Manual)"]

export const ARTIFACT_FAMILIES: ReadonlyArray<ArtifactFamily> = [
  // The phone installs the newest; Android refuses an older versionCode
  // without an uninstall, which wipes its data, so an older one is no
  // fallback.
  {
    kind: "artifact",
    name: "some-ui-apk-${{ github.sha }}",
    workflows: MOBILE,
    keep: 1,
    ttlDays: 30,
  },
  // Lint's report and R8's mapping for the APK the phone has.
  {
    kind: "artifact",
    name: "mobile-review-${{ github.sha }}",
    workflows: MOBILE,
    keep: 1,
    ttlDays: 3,
  },
  {
    kind: "artifact",
    name: "mobile-launch-apk-${{ github.sha }}",
    workflows: MOBILE,
    keep: 0,
    ttlDays: 1,
  },
  {
    kind: "artifact",
    name: "mobile-launch-${{ github.sha }}",
    workflows: MOBILE,
    keep: 0,
    ttlDays: 1,
  },
  {
    kind: "artifact",
    name: "github-pages",
    workflows: ["Pages"],
    keep: 0,
    ttlDays: 1,
  },
  {
    kind: "artifact",
    name: "workspace-packages-dist",
    workflows: ["Extension CI"],
    keep: 0,
    ttlDays: 1,
  },
  {
    kind: "artifact",
    name: "workspace-dist",
    workflows: SIGNING,
    keep: 0,
    ttlDays: 1,
  },
  // Read by a person after the run, not by CI: the newest per extension.
  {
    kind: "artifact",
    name: "signed-${{ matrix.extension_name }}",
    workflows: SIGNING,
    keep: 1,
    ttlDays: 1,
  },
  {
    kind: "artifact",
    name: "source-${{ matrix.extension_name }}",
    workflows: SIGNING,
    keep: 1,
    ttlDays: 1,
  },
  {
    kind: "artifact",
    name: "wasm-dist-${{ matrix.crate_name }}",
    workflows: ["WASM Release"],
    keep: 0,
    ttlDays: 1,
  },
  {
    kind: "artifact",
    name: "wasm-changeset-${{ matrix.crate_name }}",
    workflows: ["WASM Release"],
    keep: 0,
    ttlDays: 1,
  },
]

export const CACHE_FAMILIES: ReadonlyArray<CacheFamily> = [
  { kind: "cache", label: "pnpm", prefix: "pnpm-", scope: "per-ref", keep: 1 },
  {
    kind: "cache",
    label: "cargo registry",
    prefix: "cargo-registry-",
    scope: "per-ref",
    keep: 1,
  },
  {
    kind: "cache",
    label: "cargo target",
    prefix: "cargo-target-",
    scope: "per-ref",
    keep: 1,
  },
  {
    kind: "cache",
    label: "resume assets",
    prefix: "resume-assets-",
    scope: "per-ref",
    keep: 1,
  },
  // pages.yml and mobile-apk.yml, keyed on packages' src.
  {
    kind: "cache",
    label: "workspace dist",
    prefix: "workspace-dist-",
    scope: "per-ref",
    keep: 1,
  },
  // extension.yml, keyed on the tree.
  {
    kind: "cache",
    label: "workspace dist (tree)",
    prefix: "workspace-dist-tree-",
    scope: "per-ref",
    keep: 1,
  },
  {
    kind: "cache",
    label: "extension build",
    prefix: "ext-build-",
    scope: "per-ref",
    keep: 1,
  },
  // GitHub's CodeQL default setup (a repo setting, not a workflow here).
  {
    kind: "cache",
    label: "CodeQL",
    prefix: "codeql-",
    scope: "per-ref",
    keep: 1,
  },
  // magic-nix-cache: `<hash>.nar.zstd-<nonce>` and `<hash>.narinfo-<nonce>`,
  // written under a random nonce and looked up by the part before it.
  {
    kind: "cache",
    label: "Nix store",
    pattern: /^[0-9a-z]{32,52}\.(?:nar\.zstd|narinfo)-/,
    scope: "shared",
    keep: 1,
  },
  {
    kind: "cache",
    label: "Docker layers",
    prefix: "buildkit-",
    scope: "pool",
    keep: 0,
  },
  {
    kind: "cache",
    label: "Docker layer index",
    prefix: "index-buildkit-",
    scope: "pool",
    keep: 0,
  },
]

export type RunState = "pending" | "validated" | "failed"

export type Artifact = {
  readonly id: number
  readonly name: string
  readonly runId: number
  // The run's branch, prefixed with its repository when it comes from a fork.
  readonly branch: string
  readonly bytes: number
}

export type Cache = {
  readonly id: number
  readonly key: string
  readonly ref: string
  readonly createdAt: string
  readonly bytes: number
}

type Reason = "superseded" | "abandoned" | "consumed" | "duplicate" | "dead-ref"

export type Deletion =
  | {
      readonly target: "artifact"
      readonly family: string
      readonly reason: Reason
      readonly item: Artifact
    }
  | {
      readonly target: "cache"
      readonly family: string
      readonly reason: Reason
      readonly item: Cache
    }

export type Plan = {
  readonly deletions: ReadonlyArray<Deletion>
  readonly undeclaredArtifacts: ReadonlyArray<Artifact>
  readonly undeclaredCaches: ReadonlyArray<Cache>
}

export type State = {
  readonly artifacts: ReadonlyArray<Artifact>
  readonly runs: ReadonlyMap<number, RunState>
  readonly caches: ReadonlyArray<Cache>
  // Refs whose caches something can still read.
  readonly liveRefs: ReadonlySet<string>
}

const MAIN = "refs/heads/main"

function literalLength(template: string): number {
  return template.replace(/\$\{\{[^}]*\}\}/g, "").length
}

function templatePattern(template: string): RegExp {
  const source = template
    .split(/\$\{\{[^}]*\}\}/)
    .map((part) => part.replace(/[.*+?^$()[\]{}|\\]/g, "\\$&"))
    .join(".+")
  return new RegExp(`^${source}$`)
}

// The family whose template matches with the most literal text, so
// `mobile-launch-apk-<sha>` belongs to that family and not `mobile-launch-*`.
export function artifactFamily(
  name: string,
  families: ReadonlyArray<ArtifactFamily> = ARTIFACT_FAMILIES
): ArtifactFamily | undefined {
  return families
    .filter((family) => templatePattern(family.name).test(name))
    .sort((a, b) => literalLength(b.name) - literalLength(a.name))[0]
}

export function cacheFamily(
  key: string,
  families: ReadonlyArray<CacheFamily> = CACHE_FAMILIES
): CacheFamily | undefined {
  return families
    .filter((family) =>
      family.prefix === undefined
        ? (family.pattern?.test(key) ?? false)
        : key.startsWith(family.prefix)
    )
    .sort((a, b) => (b.prefix?.length ?? 0) - (a.prefix?.length ?? 0))[0]
}

export function artifactLineage(name: string): string {
  return name.replace(/[0-9a-f]{40}/g, "")
}

export function cacheLineage(key: string): string {
  return key.replace(/-[^-]*$/, "")
}

function groupBy<T>(
  items: ReadonlyArray<T>,
  key: (item: T) => string
): Array<Array<T>> {
  const groups = new Map<string, Array<T>>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return [...groups.values()]
}

function newestRunFirst(a: Artifact, b: Artifact): number {
  return b.runId - a.runId || b.id - a.id
}

function newestCacheFirst(a: Cache, b: Cache): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id
}

function planArtifacts(
  state: State,
  families: ReadonlyArray<ArtifactFamily>,
  deletions: Array<Deletion>,
  undeclared: Array<Artifact>
): void {
  const byFamily = new Map<ArtifactFamily, Array<Artifact>>()
  for (const artifact of state.artifacts) {
    const family = artifactFamily(artifact.name, families)
    if (!family) {
      undeclared.push(artifact)
      continue
    }
    byFamily.set(family, [...(byFamily.get(family) ?? []), artifact])
  }
  for (const [family, members] of byFamily) {
    const add = (item: Artifact, reason: Reason): void => {
      deletions.push({ target: "artifact", family: family.name, reason, item })
    }
    const groups = groupBy(
      members,
      (a) => `${artifactLineage(a.name)}\0${a.branch}`
    )
    for (const group of groups) {
      const stateOf = (a: Artifact): RunState =>
        state.runs.get(a.runId) ?? "pending"
      const validated = group
        .filter((a) => stateOf(a) === "validated")
        .sort(newestRunFirst)
      const newest = validated[0]?.runId
      for (const [rank, artifact] of validated.entries()) {
        if (family.keep === 0) add(artifact, "consumed")
        else if (rank >= family.keep) add(artifact, "superseded")
      }
      if (newest === undefined || family.keep === 0) continue
      for (const artifact of group) {
        if (stateOf(artifact) === "failed" && artifact.runId < newest) {
          add(artifact, "abandoned")
        }
      }
    }
  }
}

function planCaches(
  state: State,
  families: ReadonlyArray<CacheFamily>,
  deletions: Array<Deletion>,
  undeclared: Array<Cache>
): void {
  const live: Array<{ family: CacheFamily; cache: Cache }> = []
  for (const cache of state.caches) {
    const family = cacheFamily(cache.key, families)
    if (!family) {
      undeclared.push(cache)
      continue
    }
    if (!state.liveRefs.has(cache.ref)) {
      deletions.push({
        target: "cache",
        family: family.label,
        reason: "dead-ref",
        item: cache,
      })
      continue
    }
    live.push({ family, cache })
  }
  const add = (family: CacheFamily, item: Cache, reason: Reason): void => {
    deletions.push({ target: "cache", family: family.label, reason, item })
  }
  for (const group of groupBy(
    live,
    ({ family, cache }) =>
      `${family.label}\0${cacheLineage(cache.key)}${family.scope === "per-ref" ? `\0${cache.ref}` : ""}`
  )) {
    const family = group[0]?.family
    if (!family || family.scope === "pool") continue
    const caches = group.map(({ cache }) => cache).sort(newestCacheFirst)
    if (family.scope === "per-ref") {
      for (const cache of caches.slice(family.keep)) {
        add(family, cache, "superseded")
      }
      continue
    }
    // shared: one copy, `main`'s when there is one; otherwise each ref keeps
    // its own newest, since a PR reads only its own and `main`'s.
    const onMain = caches.filter((cache) => cache.ref === MAIN)
    if (onMain.length > 0) {
      for (const cache of caches) {
        if (cache !== onMain[0]) add(family, cache, "duplicate")
      }
      continue
    }
    for (const perRef of groupBy(caches, (cache) => cache.ref)) {
      for (const cache of perRef.slice(1)) add(family, cache, "duplicate")
    }
  }
}

export function plan(
  state: State,
  artifactFamilies: ReadonlyArray<ArtifactFamily> = ARTIFACT_FAMILIES,
  cacheFamilies: ReadonlyArray<CacheFamily> = CACHE_FAMILIES
): Plan {
  const deletions: Array<Deletion> = []
  const undeclaredArtifacts: Array<Artifact> = []
  const undeclaredCaches: Array<Cache> = []
  planArtifacts(state, artifactFamilies, deletions, undeclaredArtifacts)
  planCaches(state, cacheFamilies, deletions, undeclaredCaches)
  return { deletions, undeclaredArtifacts, undeclaredCaches }
}
