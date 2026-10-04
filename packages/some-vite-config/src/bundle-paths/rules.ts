// What each build profile's output may carry, checked against the written
// build (`readBuild`). The rule is the one AUDIENCES.md's "Paths" section
// states: a profile ships only code on its own path. Everything here is a
// way to say which code that is, for code the audience system cannot see
// (app-local modules, npm packages, chunks the bundler emits and nothing
// loads).
import { matchesAny } from "./glob.js"
import type { BuildContents } from "./read.js"

export type PathRules<Profile extends string> = {
  /**
   * Modules that are on some profiles' paths only. A module matching
   * `modules` in any other profile's output is a violation.
   */
  readonly exclusive: ReadonlyArray<{
    readonly modules: ReadonlyArray<string>
    readonly profiles: ReadonlyArray<Profile>
    readonly why: string
  }>
  /**
   * In `profile`, every module matching `within` must also match one of
   * `allow`. An allowlist, so that something added under `within` later is
   * off that profile's path until someone says otherwise.
   */
  readonly allowlists: ReadonlyArray<{
    readonly profile: Profile
    readonly within: string
    readonly allow: ReadonlyArray<string>
    readonly why: string
  }>
  /** Modules `profile`'s output must carry: what that deployable is for. */
  readonly required: ReadonlyArray<{
    readonly profile: Profile
    readonly modules: ReadonlyArray<string>
    readonly why: string
  }>
  /**
   * `exclusive` and `allowlists` violations tolerated today. Each names the
   * change that removes it; an entry that no longer matches anything is
   * itself a violation, so the list only shrinks.
   */
  readonly debt: ReadonlyArray<{
    readonly profile: Profile
    readonly module: string
    readonly why: string
  }>
  /**
   * Modules whose presence per profile something else decides, exempt from
   * `checkExclusivity`: `packages/ui/*` workspaces (their audience), npm
   * packages (whatever imports them is classified instead).
   */
  readonly decidedElsewhere: ReadonlyArray<{
    readonly modules: ReadonlyArray<string>
    readonly why: string
  }>
  /**
   * The largest chunk that may have no sourcemap (virtual modules: an
   * audience stub, the build-profile module, Vite's preload helper). Default
   * 2048 bytes.
   */
  readonly maxUnmappedBytes?: number
}

/** Typed against the profiles, like `defineProfiles`. */
export function definePaths<Profile extends string>(
  rules: PathRules<Profile>
): PathRules<Profile> {
  return rules
}

export type PathViolation =
  | {
      readonly kind: "orphan-chunk"
      readonly file: string
      readonly bytes: number
    }
  | {
      readonly kind: "unmapped-chunk"
      readonly file: string
      readonly bytes: number
    }
  | {
      readonly kind: "off-path"
      readonly module: string
      readonly files: ReadonlyArray<string>
      readonly bytes: number
      /**
       * When the module is an `import()` target: its chunk and every chunk
       * loaded only through it, and their size.
       */
      readonly behind: ReadonlyArray<string>
      readonly behindBytes: number
      readonly why: string
    }
  | { readonly kind: "missing"; readonly module: string; readonly why: string }
  | {
      readonly kind: "undeclared-exclusive"
      readonly module: string
      readonly profiles: ReadonlyArray<string>
    }
  | {
      readonly kind: "stale-debt"
      readonly module: string
      readonly why: string
    }

const DEFAULT_MAX_UNMAPPED_BYTES = 2048

/** Why `id` is off `profile`'s path, or nothing when it is on it. */
function offPathReasons<Profile extends string>(
  profile: Profile,
  id: string,
  rules: PathRules<Profile>
): Array<string> {
  return [
    ...rules.exclusive
      .filter((rule) => !rule.profiles.includes(profile))
      .filter((rule) => matchesAny(id, rule.modules))
      .map((rule) => rule.why),
    ...rules.allowlists
      .filter((rule) => rule.profile === profile)
      .filter((rule) => matchesAny(id, [rule.within]))
      .filter((rule) => !matchesAny(id, rule.allow))
      .map((rule) => rule.why),
  ]
}

/** Every violation of `rules` in `profile`'s build, debt applied. */
export function checkPaths<Profile extends string>(
  profile: Profile,
  build: BuildContents,
  rules: PathRules<Profile>
): Array<PathViolation> {
  const violations: Array<PathViolation> = []
  const maxUnmapped = rules.maxUnmappedBytes ?? DEFAULT_MAX_UNMAPPED_BYTES
  const byFile = new Map(build.chunks.map((chunk) => [chunk.file, chunk]))

  const where = new Map<string, { files: Array<string>; bytes: number }>()
  for (const chunk of build.chunks) {
    if (!chunk.reachable) {
      violations.push({
        kind: "orphan-chunk",
        file: chunk.file,
        bytes: chunk.bytes,
      })
    }
    if (!chunk.mapped && chunk.bytes > maxUnmapped) {
      violations.push({
        kind: "unmapped-chunk",
        file: chunk.file,
        bytes: chunk.bytes,
      })
    }
    for (const [id, bytes] of chunk.modules) {
      const entry = where.get(id) ?? { files: [], bytes: 0 }
      entry.files.push(chunk.file)
      entry.bytes += bytes
      where.set(id, entry)
    }
  }

  const offPath = new Map<string, Array<string>>()
  for (const id of where.keys()) {
    const reasons = offPathReasons(profile, id, rules)
    if (reasons.length > 0) offPath.set(id, reasons)
  }

  // A chunk whose entry module is off the path is a dead end: whatever loads
  // only through it is off the path too, whatever its modules are (the
  // résumé's components, behind the résumé route). Walk from the roots
  // without entering a dead end; what the walk misses, but the full graph
  // reaches, sits behind one.
  const isDeadEnd = (file: string): boolean =>
    (byFile.get(file)?.facades ?? []).some((id) => offPath.has(id))
  const walk = (
    from: ReadonlyArray<string>,
    stop: (file: string) => boolean
  ): Set<string> => {
    const seen = new Set<string>()
    const queue = from.filter((file) => !stop(file))
    while (queue.length > 0) {
      const file = queue.shift() ?? ""
      if (seen.has(file)) continue
      seen.add(file)
      queue.push(
        ...(byFile.get(file)?.refs ?? []).filter((next) => !stop(next))
      )
    }
    return seen
  }
  const onPath = walk(build.roots, isDeadEnd)
  const behind = new Map<string, Array<string>>()
  for (const chunk of build.chunks) {
    if (!isDeadEnd(chunk.file) || !chunk.reachable) continue
    // The dead end itself, and what loads only through it.
    const reached = [
      chunk.file,
      ...walk(chunk.refs, (file) => onPath.has(file) || isDeadEnd(file)),
    ]
    for (const id of chunk.facades.filter((facade) => offPath.has(facade))) {
      behind.set(id, reached)
    }
  }

  const debt = rules.debt.filter((entry) => entry.profile === profile)
  const usedDebt = new Set<(typeof debt)[number]>()
  for (const [id, reasons] of offPath) {
    const owed = debt.find((entry) => matchesAny(id, [entry.module]))
    if (owed !== undefined) {
      usedDebt.add(owed)
      continue
    }
    const { files, bytes } = where.get(id) ?? { files: [], bytes: 0 }
    const hidden = behind.get(id) ?? []
    violations.push({
      kind: "off-path",
      module: id,
      files,
      bytes,
      behind: hidden,
      behindBytes: hidden.reduce(
        (sum, file) => sum + (byFile.get(file)?.bytes ?? 0),
        0
      ),
      why: reasons.join("; "),
    })
  }

  for (const rule of rules.required.filter((r) => r.profile === profile)) {
    for (const pattern of rule.modules) {
      if (![...where.keys()].some((id) => matchesAny(id, [pattern]))) {
        violations.push({ kind: "missing", module: pattern, why: rule.why })
      }
    }
  }

  for (const entry of debt) {
    if (!usedDebt.has(entry)) {
      violations.push({
        kind: "stale-debt",
        module: entry.module,
        why: entry.why,
      })
    }
  }
  return violations
}

/**
 * Across every profile's build: a module that ships in some profiles and not
 * others is on some paths only, so `rules.exclusive` must say which (or
 * `decidedElsewhere` must cover it). This is what keeps `exclusive` complete:
 * a new phone-only module fails here the first time it builds, instead of
 * shipping in the web builds the day an import makes it reachable there.
 */
export function checkExclusivity<Profile extends string>(
  builds: ReadonlyMap<Profile, BuildContents>,
  rules: PathRules<Profile>
): Array<PathViolation> {
  const builtProfiles = [...builds]
  const presence = new Map<string, Set<string>>()
  for (const [profile, build] of builtProfiles) {
    for (const chunk of build.chunks) {
      for (const id of chunk.modules.keys()) {
        const set = presence.get(id) ?? new Set<string>()
        set.add(profile)
        presence.set(id, set)
      }
    }
  }
  const declared = [
    ...rules.exclusive.flatMap((rule) => rule.modules),
    ...rules.decidedElsewhere.flatMap((rule) => rule.modules),
  ]
  const violations: Array<PathViolation> = []
  for (const [id, carried] of presence) {
    if (carried.size === builtProfiles.length || matchesAny(id, declared))
      continue
    violations.push({
      kind: "undeclared-exclusive",
      module: id,
      profiles: [...carried].sort(),
    })
  }
  return violations
}

export function describePathViolation(violation: PathViolation): string {
  const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`
  switch (violation.kind) {
    case "orphan-chunk": {
      return `${violation.file} (${kib(violation.bytes)}) is emitted but nothing loads it. A branch the bundler folded after laying out chunks usually leaves one: read the flag where you branch on it, not through an imported constant.`
    }
    case "unmapped-chunk": {
      return `${violation.file} (${kib(violation.bytes)}) has no sourcemap, so what it carries cannot be checked.`
    }
    case "off-path": {
      const behind =
        violation.behind.length === 0
          ? ""
          : `; loading it fetches ${kib(violation.behindBytes)} in ${violation.behind.length} chunk(s) nothing on the path loads (${violation.behind.join(", ")})`
      return `${violation.module} ships in ${violation.files.join(", ")} (${kib(violation.bytes)})${behind}, but is off this profile's path: ${violation.why}`
    }
    case "missing": {
      return `nothing matching ${violation.module} is in the output: ${violation.why}`
    }
    case "undeclared-exclusive": {
      return `${violation.module} ships only in ${violation.profiles.join(", ")}: say so in \`exclusive\`, so a later import cannot carry it anywhere else unnoticed`
    }
    case "stale-debt": {
      return `debt entry ${violation.module} matches nothing any more: remove it (${violation.why})`
    }
    default: {
      return assertNever(violation)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(
    `[bundle-paths] unexpected violation: ${JSON.stringify(value)}`
  )
}
