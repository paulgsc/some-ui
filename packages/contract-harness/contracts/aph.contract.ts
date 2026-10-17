/**
 * The owner's aph record (paulgsc/server `routes/aph.rs` and
 * `handlers/aph.rs`): what the phone keeps on home once its person opts in
 * (`packages/ui/aph/src/lib/sync.ts` calls these through the app's home
 * link).
 *
 * Hand-written: `AphRecordSchema` is the outline of what `readHeld` in
 * `packages/ui/aph/src/lib/stored.ts` takes, checked by hand against the
 * server's `aph_repo::Record` (`settings`, or null before the phone first
 * sends them, and every entry's standing revision). That reader holds each
 * entry to its full shape on the way in.
 *
 * Every route is per person, so every contract is a `session` contract. The
 * record is append-only, so no probe may keep anything: both writes are
 * pinned by a refusal, which writes nothing.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const AphRecordSchema = z.object({
  settings: z.object({ checkpoints: z.array(z.unknown()) }).nullable(),
  entries: z.array(z.object({ id: z.string().min(1), day: z.string() })),
})

export const contracts = [
  defineContract({
    id: "aph.record",
    module: "aph",
    session: true,
    method: "GET",
    path: "/aph",
    summary:
      "this subject's aph record as it stands: the settings (null until first sent) and each entry's latest revision",
    request: {},
    expect: { status: 200, schema: AphRecordSchema },
  }),

  defineContract({
    id: "aph.entry_refused",
    module: "aph",
    session: true,
    method: "PUT",
    path: "/aph/entries/:id",
    summary:
      "a body that is not an aph entry is a 422 naming the field, and nothing is written",
    mutates: true,
    request: {
      path: { id: "contract-harness-does-not-exist" },
      body: "not an entry",
    },
    expect: { status: 422 },
  }),

  defineContract({
    id: "aph.settings_refused",
    module: "aph",
    session: true,
    method: "PUT",
    path: "/aph/settings",
    summary:
      "a body that is not aph's settings is a 422, and nothing is written",
    mutates: true,
    request: { body: "not settings" },
    expect: { status: 422 },
  }),
]
