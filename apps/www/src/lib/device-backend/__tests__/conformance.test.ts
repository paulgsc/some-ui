/**
 * The device backend against the same oracle `file_host` is held to: every
 * contract in `@some-ui/contract-harness` whose route the device serves is
 * probed through the device's `fetch`, and must pass.
 *
 * A contract for a route the device does not serve is skipped by name, so a
 * new server route shows up as a gap to decide on, not as silence.
 */
import { readFileSync } from "node:fs"
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import type { Contract } from "@some-ui/contract-harness"
import {
  allContracts,
  parseInventory,
  probeContract,
} from "@some-ui/contract-harness"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DEVICE_ROUTES, openDeviceBackend } from "@/lib/device-backend/backend"
import { createDeviceFetch } from "@/lib/device-backend/interceptor"

const ORIGIN = "https://device.test"

/** The server's own route inventory, as the harness's drift check reads it. */
const serverRoutes = parseInventory(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../packages/contract-harness/routes.server.json",
        import.meta.url
      ),
      "utf8"
    )
  )
)

/**
 * Contracts the device answers differently on purpose, each with why. Kept
 * short and named: anything else that fails here is a defect.
 */
const DELIBERATE: Readonly<Record<string, string>> = {
  "auth.session_signed_out":
    "the phone has one person and no passkeys; /auth/session is always signed in",
  "push.subscribe":
    "no VAPID identity on a phone; 503 feature_not_configured is the client's fall-back signal",
  "push.unsubscribe": "as push.subscribe",
}

function served(contract: Contract): boolean {
  return DEVICE_ROUTES.some(
    (route) => route.method === contract.method && route.path === contract.path
  )
}

describe("device backend conformance", () => {
  beforeEach(async () => {
    const backend = await openDeviceBackend(openNodeSqlite())
    const deviceFetch = createDeviceFetch(
      new URL(`${ORIGIN}/api/v1`),
      () => Promise.resolve(backend),
      () => Promise.reject(new Error("no network in this test"))
    )
    vi.stubGlobal("fetch", deviceFetch)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const covered = allContracts.filter(
    (contract) =>
      contract.versioned !== false &&
      served(contract) &&
      !(contract.id in DELIBERATE)
  )

  it("covers the contracts of every family the phone needs", () => {
    const ids = covered.map((contract) => contract.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        "shelf.list",
        "shelf.keep_refused",
        "leetype.manifest",
        "leetype.runs",
        "push.vapid_key",
      ])
    )
  })

  it.each(covered.map((contract) => [contract.id, contract] as const))(
    "%s",
    async (_id, contract) => {
      const outcome = await probeContract(contract, {
        baseUrl: ORIGIN,
        sessionCookie: "device",
      })
      const failures = outcome.findings.filter(
        (finding) => finding.severity === "fail"
      )
      expect(failures).toEqual([])
      expect(["passed", "warned"]).toContain(outcome.status)
    }
  )

  it("names only deliberate divergences that are real contracts", () => {
    const known = new Set(allContracts.map((contract) => contract.id))
    expect(Object.keys(DELIBERATE).filter((id) => !known.has(id))).toEqual([])
  })

  it("serves only routes file_host itself serves", () => {
    const inventory = new Set(
      serverRoutes.routes.map((route) => `${route.method} ${route.path}`)
    )
    const invented = DEVICE_ROUTES.filter(
      (route) => !inventory.has(`${route.method} ${route.path}`)
    ).map((route) => `${route.method} ${route.path}`)
    expect(invented).toEqual([])
  })
})
