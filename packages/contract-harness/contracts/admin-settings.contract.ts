/**
 * The operator's levers: `GET /admin/settings/:namespace`, its history, and
 * the `PUT` that sets one (paulgsc/server, `routes::admin_settings`;
 * ADMIN1 paulgsc/server#501, the administration epic #2357). The web app's
 * home-network page (`apps/www/src/lib/home-switches`) is the one caller.
 *
 * Hand-written, like every contract here: the schemas are transcribed from
 * `Standing`, `Written` and `History` in
 * `apps/servers/file_host/src/handlers/admin_settings.rs` and checked by hand
 * against the client's own reading of them (`lib/home-switches/client.ts`):
 * camelCase, `revision`, `setBy` and `setAt` always present and `null` while
 * the setting reads as its default, and `setBy` a role, never a subject.
 *
 * Every route here is operator-only (paulgsc/server `auth::operator`): `401`
 * without a passkey session, `403` for anyone but the home's owner (or the
 * subjects `OPERATOR_SUBJECTS` lists). So each contract is marked `session`,
 * and the cookie passed with `--session-cookie` must be an operator's.
 *
 * No contract sets a lever: one set on a real server changes what home does
 * (pausing Rust Rounds' recording), and every revision is kept for good. The
 * write route is pinned by its refusal instead, and marked `mutates` anyway,
 * as `curriculum_operator.write_refused` is.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/** Rust Rounds recording, the first lever: on by default. */
const RustRoundsSchema = z.object({ recording: z.boolean() })

const SetBySchema = z.enum(["owner", "operator"])

const StandingSchema = z.object({
  namespace: z.literal("rust-rounds"),
  value: RustRoundsSchema,
  isDefault: z.boolean(),
  default: RustRoundsSchema,
  revision: z.number().int().positive().nullable(),
  setBy: SetBySchema.nullable(),
  setAt: z.string().nullable(),
})

const HistorySchema = z.object({
  namespace: z.literal("rust-rounds"),
  default: RustRoundsSchema,
  revisions: z.array(
    z.object({
      revision: z.number().int().positive(),
      value: RustRoundsSchema,
      setBy: SetBySchema,
      setAt: z.string(),
    })
  ),
})

/** A namespace no home has, so the miss below is a real miss. */
const ABSENT_NAMESPACE = "contract-harness-does-not-exist"

export const contracts = [
  defineContract({
    id: "admin_settings.rust_rounds",
    module: "admin_settings",
    session: true,
    method: "GET",
    path: "/admin/settings/:namespace",
    summary:
      "Rust Rounds recording as it stands: the value home follows, whether it is the default, and who set it and when",
    request: { path: { namespace: "rust-rounds" } },
    expect: { status: 200, schema: StandingSchema, unknownFields: "reject" },
  }),

  defineContract({
    id: "admin_settings.rust_rounds_history",
    module: "admin_settings",
    session: true,
    method: "GET",
    path: "/admin/settings/:namespace/history",
    summary:
      "every revision of Rust Rounds recording, newest first, each with who set it and when",
    request: { path: { namespace: "rust-rounds" } },
    expect: { status: 200, schema: HistorySchema, unknownFields: "reject" },
  }),

  defineContract({
    id: "admin_settings.write_refused",
    module: "admin_settings",
    session: true,
    method: "PUT",
    path: "/admin/settings/:namespace",
    summary:
      "a value its lever's schema refuses is a 422, and nothing is kept - the only write a probe can make without changing what home does",
    mutates: true,
    request: {
      path: { namespace: "rust-rounds" },
      body: { recording: "off" },
    },
    expect: { status: 422 },
  }),

  defineContract({
    id: "admin_settings.unknown_namespace",
    module: "admin_settings",
    session: true,
    method: "GET",
    path: "/admin/settings/:namespace",
    summary: "a lever home does not have is a 404, not a default",
    request: { path: { namespace: ABSENT_NAMESPACE } },
    expect: { status: 404 },
  }),
]
