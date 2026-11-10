/**
 * `GET /compat?needs=<epoch>`: whether home serves a build of the app made
 * against server contract epoch `needs`, and if not, what home does about it
 * (paulgsc/server#779). Unversioned, and answered without a session. The
 * phone asks it at start, back in the foreground and on a not-found
 * (`apps/www/src/lib/home-link/compat-read.ts`), and reads `supported` and
 * `deploy` (`serves-model.ts`'s `servesOf`).
 *
 * Probed with `needs=1`, the first epoch, which a server that has this route
 * always serves: an epoch home serves touches nothing on home, where one
 * above it would ask home for a deploy.
 *
 * Mirrors `CompatResponse` in
 * `apps/servers/file_host/src/handlers/compat.rs`.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const CompatResponseSchema = z.object({
  running: z.object({
    epoch: z.number().int(),
    oldest_supported: z.number().int(),
    version: z.string(),
  }),
  needs: z.number().int(),
  supported: z.boolean(),
  deploy: z.enum([
    "none",
    "client_behind",
    "refused",
    "in_flight",
    "unavailable",
    "cooldown",
    "wanted",
    "cannot_request",
  ]),
  latest_seen_epoch: z.number().int().optional(),
  retry_after_s: z.number().int().optional(),
})

export const contracts = [
  defineContract({
    id: "compat.get",
    module: "compat",
    method: "GET",
    path: "/compat",
    versioned: false,
    summary:
      "whether home serves a build of the app, and whether a newer server is coming",
    request: { query: { needs: 1 } },
    expect: { status: 200, schema: CompatResponseSchema },
  }),
]
