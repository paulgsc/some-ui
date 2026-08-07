/**
 * `/health` is the one route deliberately left outside `/api/v1`, so that load
 * balancers and orchestrators do not have to track API version bumps. That
 * exemption is itself a handshake worth pinning: if it ever drifts under the
 * prefix, every health probe in the deployment breaks at once.
 *
 * Mirrors `HealthResponse` in `apps/servers/file_host/src/handlers/health.rs`.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const HealthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
})

export const contracts = [
  defineContract({
    id: "health.get",
    module: "health",
    method: "GET",
    path: "/health",
    versioned: false,
    summary: "liveness probe, served unversioned",
    expect: {
      status: 200,
      schema: HealthResponseSchema,
      // The payload is consumed by infrastructure, not by application code —
      // a field appearing here silently is more likely a mistake than growth.
      unknownFields: "reject",
    },
  }),
]
