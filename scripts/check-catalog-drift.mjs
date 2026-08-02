#!/usr/bin/env node
// Guardrail: every dependency listed in pnpm-workspace.yaml's `catalog:` must
// be declared as `"catalog:"` in workspace manifests, never as a literal
// version range.
//
// Why this exists: apps/www was shipping six copies of lucide-react (0.378,
// 0.474, 0.511, 0.522, 0.525, 0.562) and two majors of zod to the browser.
// The cause was `^0.x` semantics — for a 0.x package caret pins the *minor*,
// so `^0.378.0` can never resolve to 0.562.0 and every distinct spec installs
// its own copy. Ten distinct lucide-react specs existed across seventeen
// declarations, and nothing in the toolchain objected. The catalog collapses
// them to one source of truth; this script is what stops a manifest from
// quietly opting back out with a literal range.
//
// Deliberately two-tier:
//   * catalogued dependency declared with a literal range -> ERROR, exit 1.
//     Zero of these exist today, so it is enforceable immediately and only
//     ever ratchets tighter.
//   * un-catalogued dependency declared at differing specs across workspaces
//     -> reported, exit 0. Twenty-odd of these exist right now (vite, eslint,
//     web-ext, …), almost all devDependencies that never reach a browser
//     bundle. Failing on them today would just mean turning the check off.
//     Promote one by adding it to the catalog, at which point the rule above
//     starts enforcing it permanently.
//
// No dependencies: it runs before/without an install, and a guardrail that
// needs the thing it guards to be installed first is not much of a guardrail.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const SKIP = new Set(["node_modules", "dist", ".git", "target", ".turbo"])
const BLOCKS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]
// Specs that name a location rather than a version — never version drift.
const NON_VERSION = /^(workspace|catalog|link|file|npm|git|github):/

// Minimal reader for the top-level `catalog:` block. Full YAML is overkill for
// a flat map of `name: range`, and pulling a parser in would contradict the
// no-dependencies note above. Keys may be quoted (scoped names must be).
function readCatalogNames(yaml) {
  const names = new Set()
  let inCatalog = false
  for (const raw of yaml.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd()
    if (!line.trim()) continue
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true
      continue
    }
    // Any other column-0 key ends the block.
    if (/^\S/.test(line)) {
      inCatalog = false
      continue
    }
    if (!inCatalog) continue
    const m = line.match(/^\s+(?:"([^"]+)"|'([^']+)'|([^:\s]+))\s*:/)
    if (m) names.add(m[1] ?? m[2] ?? m[3])
  }
  return names
}

function findManifests(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue // broken symlink
    }
    if (st.isDirectory()) findManifests(full, out)
    else if (entry === "package.json") out.push(full)
  }
  return out
}

const catalogued = readCatalogNames(
  readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8")
)
if (catalogued.size === 0) {
  console.error("No `catalog:` block found in pnpm-workspace.yaml.")
  process.exit(1)
}

const violations = []
const seen = new Map() // dep -> Map<spec, manifest[]>

for (const file of findManifests(ROOT)) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    continue
  }
  const where = relative(ROOT, file)
  for (const block of BLOCKS) {
    for (const [dep, spec] of Object.entries(manifest[block] ?? {})) {
      if (typeof spec !== "string") continue
      if (catalogued.has(dep) && spec !== "catalog:") {
        violations.push({ where, block, dep, spec })
      }
      if (NON_VERSION.test(spec)) continue
      if (!seen.has(dep)) seen.set(dep, new Map())
      const bySpec = seen.get(dep)
      if (!bySpec.has(spec)) bySpec.set(spec, [])
      bySpec.get(spec).push(where)
    }
  }
}

const drifting = [...seen.entries()].filter(([, bySpec]) => bySpec.size > 1)

if (drifting.length > 0) {
  console.log(
    `Un-catalogued dependencies declared at differing specs (${drifting.length}) — advisory:`
  )
  for (const [dep, bySpec] of drifting.sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    console.log(`  ${dep}: ${[...bySpec.keys()].sort().join(", ")}`)
  }
  console.log(
    "  Add one to `catalog:` in pnpm-workspace.yaml to unify and lock it in.\n"
  )
}

if (violations.length > 0) {
  console.error(
    `Catalogued dependencies declared with a literal version (${violations.length}):`
  )
  for (const v of violations) {
    console.error(`  ${v.where} [${v.block}] ${v.dep}: "${v.spec}"`)
  }
  console.error('\nReplace each with "catalog:" — the version belongs in')
  console.error("pnpm-workspace.yaml so there is one place for it to live.")
  process.exit(1)
}

console.log(
  `Catalog check passed: ${catalogued.size} catalogued dependencies, no literal-version declarations.`
)
