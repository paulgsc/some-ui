/**
 * Cross-checks the checked-in `generated/routes.ts` against
 * `@some-ui/contract-harness`'s checked-in `routes.server.json`. The two are
 * two views the server's `dump-routes` binary renders from one
 * `RouteInventory`, produced by two separate invocations (`dump-routes` and
 * `dump-routes -- --ts`) and copied into this repo by hand — nothing in this
 * monorepo's build enforces that a person regenerating one remembers the
 * other. This test reads both checked-in files fresh on every run and fails
 * the moment they disagree, per some-ui#1040's acceptance criterion: "a
 * check that fails when [routes.server.json's unique-path count and the
 * union's member count] do not [agree]."
 *
 * Reads `routes.server.json` via a plain filesystem path across to the
 * sibling `contract-harness` package directory, not a package import: this
 * package stays dependency-free (see README.md), and this story leaves
 * `contract-harness` itself untouched — wiring `@some-ui/server-routes` in
 * as an actual dependency there is some-ui#1042/CT3's job.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const routesTsPath = fileURLToPath(
  new URL("./generated/routes.ts", import.meta.url)
)
const routesJsonPath = fileURLToPath(
  new URL("../../contract-harness/routes.server.json", import.meta.url)
)

type RawRoute = { full_path: string; versioned: boolean }

/**
 * Narrows an untrusted `JSON.parse` result down to the one shape this test
 * reads from it, without a type assertion (`@typescript-eslint/consistent-type-assertions`
 * forbids `as` outright in this repo) - a raw filesystem read is exactly the
 * kind of input that is occasionally truncated, half-written, or from the
 * wrong branch, so a malformed `routes.server.json` should fail loudly here
 * rather than being trusted into a type it does not actually have.
 */
function routesOf(value: unknown): ReadonlyArray<RawRoute> {
  if (typeof value !== "object" || value === null || !("routes" in value)) {
    throw new Error('routes.server.json has no top-level "routes" array')
  }
  const { routes } = value
  if (!Array.isArray(routes)) {
    throw new Error('routes.server.json\'s "routes" field is not an array')
  }
  return routes.filter(isRawRoute)
}

function isRawRoute(value: unknown): value is RawRoute {
  return (
    typeof value === "object" &&
    value !== null &&
    "full_path" in value &&
    typeof value.full_path === "string" &&
    "versioned" in value &&
    typeof value.versioned === "boolean"
  )
}

/** Mirrors the server's own `quoted_literals` test helper in `ts_emitter.rs`. */
function quotedLiterals(block: string): Set<string> {
  // Capture group 1 is never actually optional here - it's inside the
  // pattern's only alternative, so any match has it - but `noUncheckedIndexedAccess`
  // types every RegExpMatchArray index as possibly `undefined` regardless.
  return new Set(
    [...block.matchAll(/"([^"]*)"/g)]
      .map((match) => match[1])
      .filter((literal): literal is string => literal !== undefined)
  )
}

/**
 * Slices out one `export type <name> = ...;` declaration, ending at the
 * next union's declaration when given one. Starting at the union's own
 * `export type` line (not byte 0) matters for `ServerRoute`: the preceding
 * `API_BASE_PATH` line is itself a quoted string and would otherwise leak
 * into `quotedLiterals`.
 */
function unionBlock(
  source: string,
  unionName: string,
  nextUnionName?: string
): string {
  const start = source.indexOf(`export type ${unionName}`)
  if (start === -1) {
    throw new Error(`generated/routes.ts has no "export type ${unionName}"`)
  }
  const end = nextUnionName
    ? source.indexOf(`export type ${nextUnionName}`, start)
    : -1
  return source.slice(start, end === -1 ? source.length : end)
}

describe("generated/routes.ts agrees with contract-harness's routes.server.json", () => {
  const routesTs = readFileSync(routesTsPath, "utf-8")
  const routes = routesOf(JSON.parse(readFileSync(routesJsonPath, "utf-8")))

  const tsServerRoutes = quotedLiterals(
    unionBlock(routesTs, "ServerRoute", "UnversionedRoute")
  )
  const tsUnversionedRoutes = quotedLiterals(
    unionBlock(routesTs, "UnversionedRoute")
  )

  const jsonVersionedPaths = new Set(
    routes.filter((route) => route.versioned).map((route) => route.full_path)
  )
  const jsonUnversionedPaths = new Set(
    routes.filter((route) => !route.versioned).map((route) => route.full_path)
  )

  it("has the same unique-path count as routes.server.json", () => {
    expect(tsServerRoutes.size + tsUnversionedRoutes.size).toBe(
      jsonVersionedPaths.size + jsonUnversionedPaths.size
    )
  })

  it("names exactly the same versioned paths as ServerRoute", () => {
    expect(tsServerRoutes).toEqual(jsonVersionedPaths)
  })

  it("names exactly the same unversioned paths as UnversionedRoute", () => {
    expect(tsUnversionedRoutes).toEqual(jsonUnversionedPaths)
  })
})
