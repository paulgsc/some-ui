/**
 * @module drift
 *
 * Compares the contracts against the server's own description of its route
 * surface, without talking to a server.
 *
 * This is the cheap half of the check and it catches the failure that is
 * hardest to see from here: a route that was renamed or removed on the server.
 * Behaviourally that shows up as a 404, which is indistinguishable from a
 * hundred other causes. Structurally it shows up as "the path this contract
 * targets is not in the surface the server says it serves", which names the
 * problem precisely.
 *
 * The snapshot is produced by the server repo's `dump-routes` binary and
 * checked in here. Refreshing it is the moment the two sides are married: the
 * diff on `routes.server.json` is the reviewable record of what moved.
 */

import { z } from "zod"

import type { Contract } from "./contract"
import { API_V1_PREFIX, fullPath } from "./contract"

/** Mirrors `RouteEntry` in the server's `routes/inventory.rs`. */
export type RouteEntry = {
  method: string
  path: string
  full_path: string
  versioned: boolean
  module: string
}

export type RouteInventory = {
  schema_version: number
  api_base_path: string
  server_version: string
  routes: Array<RouteEntry>
}

/**
 * The snapshot is parsed rather than trusted. It arrives as a file copied
 * between two repositories by hand, which is exactly the kind of input that is
 * occasionally truncated, half-written, or from the wrong branch — and a
 * harness that read a malformed snapshot optimistically would answer "no drift"
 * for the most confident possible wrong reason.
 */
export const RouteInventorySchema = z.object({
  schema_version: z.number(),
  api_base_path: z.string(),
  server_version: z.string(),
  routes: z.array(
    z.object({
      method: z.string(),
      path: z.string(),
      full_path: z.string(),
      versioned: z.boolean(),
      module: z.string(),
    })
  ),
})

/** Parses and version-checks a raw snapshot. */
export function parseInventory(raw: unknown): RouteInventory {
  const result = RouteInventorySchema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ")
    throw new InventoryShapeError(`route inventory is malformed — ${detail}`)
  }
  assertSupportedInventory(result.data)
  return result.data
}

/** Inventory shapes this harness knows how to read. */
export const SUPPORTED_SCHEMA_VERSION = 1

export type DriftFinding = {
  code:
    | "missing-route"
    | "module-mismatch"
    | "uncovered-route"
    | "base-path-mismatch"
  severity: "fail" | "warn" | "info"
  message: string
  detail?: string
}

export type DriftReport = {
  findings: Array<DriftFinding>
  /** Routes in the inventory that at least one contract targets. */
  covered: number
  total: number
  serverVersion: string
}

const key = (method: string, path: string): string =>
  `${method.toUpperCase()} ${path}`

export class InventoryVersionError extends Error {}
export class InventoryShapeError extends Error {}

/**
 * Validates the snapshot is one this harness understands. A newer snapshot is
 * refused rather than read optimistically — misreading the server's own
 * description of itself would produce confident, wrong findings, which is worse
 * than no findings.
 */
export function assertSupportedInventory(
  inventory: RouteInventory
): asserts inventory is RouteInventory {
  if (inventory.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new InventoryVersionError(
      `routes.server.json declares schema_version ${inventory.schema_version}, but this harness reads ${SUPPORTED_SCHEMA_VERSION}. Update @some-ui/contract-harness before regenerating the snapshot.`
    )
  }
}

export function checkDrift(
  contracts: ReadonlyArray<Contract>,
  inventory: RouteInventory
): DriftReport {
  assertSupportedInventory(inventory)

  const findings: Array<DriftFinding> = []

  // A bumped API version invalidates every versioned contract at once, so it
  // is worth naming directly rather than letting it surface as 39 separate
  // missing routes.
  if (inventory.api_base_path !== API_V1_PREFIX) {
    findings.push({
      code: "base-path-mismatch",
      severity: "fail",
      message: `server nests versioned routes under ${inventory.api_base_path}, the client builds ${API_V1_PREFIX}`,
      detail:
        "Update API_V1_PREFIX in packages/fetch-kit/src/lib/api-config and in this harness together.",
    })
  }

  const byKey = new Map<string, RouteEntry>()
  for (const route of inventory.routes) {
    byKey.set(key(route.method, route.full_path), route)
  }

  const touched = new Set<string>()

  for (const contract of contracts) {
    const target = key(contract.method, fullPath(contract))
    const route = byKey.get(target)

    if (route === undefined) {
      findings.push({
        code: "missing-route",
        severity: "fail",
        message: `contract "${contract.id}" targets ${target}, which the server does not serve`,
        detail:
          "The route was renamed or removed. Update the contract, or regenerate routes.server.json if the snapshot is stale.",
      })
      continue
    }

    touched.add(target)

    if (route.module !== contract.module) {
      findings.push({
        code: "module-mismatch",
        severity: "warn",
        message: `contract "${contract.id}" claims module "${contract.module}", server groups it under "${route.module}"`,
      })
    }
  }

  for (const route of inventory.routes) {
    const target = key(route.method, route.full_path)
    if (touched.has(target)) continue
    findings.push({
      code: "uncovered-route",
      severity: "info",
      message: `no contract covers ${target}`,
      detail: `module: ${route.module}`,
    })
  }

  return {
    findings,
    covered: touched.size,
    total: inventory.routes.length,
    serverVersion: inventory.server_version,
  }
}
