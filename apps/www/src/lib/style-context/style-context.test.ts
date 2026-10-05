import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import styleContext from "@/style.context"
import { describe, expect, it } from "vitest"

/**
 * Every UI package www can render must be in style.context.ts's scan set.
 *
 * A package left out loses only the classes no scanned package shares, so it
 * ships mostly right and subtly broken. The list is checked against the
 * dependency closure, walked from the manifests (`pnpm list` takes ~17s).
 */

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const REPO_ROOT = resolve(APP_ROOT, "../..")
const UI_ROOT = resolve(REPO_ROOT, "packages/ui")

type Manifest = {
  name?: unknown
  dependencies?: unknown
  devDependencies?: unknown
}

function readManifest(dir: string): Manifest | null {
  const file = resolve(dir, "package.json")
  if (!existsSync(file)) return null
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
  return typeof parsed === "object" && parsed !== null ? parsed : null
}

/** Every workspace package, by name, mapped to its directory. */
function workspacePackages(): Map<string, string> {
  const byName = new Map<string, string>()

  for (const group of ["packages", "apps", "extensions", "crates"]) {
    const root = resolve(REPO_ROOT, group)
    if (!existsSync(root)) continue

    // One level, then two — the repo nests ui packages under packages/ui.
    const candidates = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const dir = resolve(root, entry.name)
        const nested = readdirSync(dir, { withFileTypes: true })
          .filter((child) => child.isDirectory())
          .map((child) => resolve(dir, child.name))
        return [dir, ...nested]
      })

    for (const dir of candidates) {
      const name = readManifest(dir)?.name
      if (typeof name === "string") byName.set(name, dir)
    }
  }

  return byName
}

/** Directory names under packages/ui reachable from www's dependencies. */
function uiPackagesInGraph(): Array<string> {
  const byName = workspacePackages()
  const seen = new Set<string>()
  const found = new Set<string>()
  const queue = ["www"]

  while (queue.length > 0) {
    const name = queue.pop()!
    if (seen.has(name)) continue
    seen.add(name)

    const dir = byName.get(name)
    if (dir === undefined) continue

    if (dir.startsWith(`${UI_ROOT}/`)) {
      found.add(dir.slice(UI_ROOT.length + 1).split("/")[0])
    }

    const manifest = readManifest(dir)
    for (const field of ["dependencies", "devDependencies"] as const) {
      const deps: unknown = manifest?.[field]
      if (typeof deps !== "object" || deps === null) continue
      // Only workspace links are part of the closure; registry deps are not.
      for (const [dep, range] of Object.entries(deps)) {
        if (typeof range === "string" && range.startsWith("workspace:")) {
          queue.push(dep)
        }
      }
    }
  }

  found.delete("www")
  return [...found]
}

/**
 * A package "renders" if it ships .tsx source; pure-TS packages have nothing
 * to scan.
 */
function shipsComponents(pkg: string): boolean {
  const src = resolve(UI_ROOT, pkg, "src")
  if (!existsSync(src)) return false

  const stack = [src]
  while (stack.length > 0) {
    const dir = stack.pop()!
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        stack.push(resolve(dir, entry.name))
      } else if (entry.name.endsWith(".tsx")) {
        return true
      }
    }
  }
  return false
}

const UI_GLOB_MARKER = "packages/ui/"

const SCANNED = new Set(
  styleContext.default.content.flatMap((glob) => {
    const at = glob.indexOf(UI_GLOB_MARKER)
    return at === -1
      ? []
      : [glob.slice(at + UI_GLOB_MARKER.length).split("/")[0]]
  })
)

describe("www style context", () => {
  it("finds the ui packages www depends on", () => {
    // Guards the guard: a walk that silently found nothing would make the
    // real assertion below pass for the wrong reason.
    const graph = uiPackagesInGraph()
    expect(graph).toContain("leetype")
    expect(graph).toContain("honeycomb")
    expect(graph.length).toBeGreaterThan(5)
  })

  it("scans every renderable UI package in www's dependency graph", () => {
    const missing = uiPackagesInGraph()
      .filter(shipsComponents)
      .filter((pkg) => !SCANNED.has(pkg))
      .sort()

    expect(
      missing,
      `packages/ui/{${missing.join(", ")}} render in www but are not scanned ` +
        `by apps/www/style.context.ts. Their utilities are generated only ` +
        `where a scanned package happens to use the same class, so they will ` +
        `render partially-styled in www and correctly everywhere else. Add ` +
        `them to uiPackages.`
    ).toEqual([])
  })

  it("scans no package that does not exist", () => {
    // The reverse direction: an entry whose directory is gone matches
    // nothing and fails silently.
    const phantom = [...SCANNED]
      .filter((pkg) => !existsSync(resolve(UI_ROOT, pkg, "src")))
      .sort()

    expect(
      phantom,
      `apps/www/style.context.ts scans packages/ui/{${phantom.join(", ")}}, ` +
        `which has no src directory. Remove it from uiPackages.`
    ).toEqual([])
  })
})
