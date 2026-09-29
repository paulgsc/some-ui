/**
 * The learner shelf (paulgsc/server#387, `routes::shelf` and
 * `handlers/shelf.rs`): what a learner generated themselves and asked, per
 * item, to keep on their account. `apps/www/src/lib/shelf-client` calls
 * these for `@some-ui/topik` and `@some-ui/leetype`.
 *
 * Hand-written, like every contract here: `ShelfListingSchema` is what that
 * client's `list` believes it receives, checked by hand against the
 * server's `Listing` (`items` of `learner_shelf_repo::ShelfEntry`, in
 * camelCase, and `cap`). A kept body is not pinned: the server stores and
 * serves it verbatim and never parses more than "a JSON object or array",
 * and each package's own intake is what holds it on the way back in.
 *
 * Every route is per person, so every contract is a `session` contract. No
 * contract keeps anything: an item takes one of the probing subject's
 * twenty places on the shelf, so there is no harmless probe write. The PUT
 * is pinned by its refusal, and the DELETE by removing a key no one kept,
 * which the server answers `204` whether or not it was there.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const ShelfEntrySchema = z.object({
  key: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  savedAt: z.string(),
})

const ShelfListingSchema = z.object({
  items: z.array(ShelfEntrySchema),
  cap: z.number().int().positive(),
})

/** A key no one keeps, so every miss below is a real miss. */
const ABSENT_KEY = "contract-harness-does-not-exist"

export const contracts = [
  defineContract({
    id: "shelf.list",
    module: "shelf",
    session: true,
    method: "GET",
    path: "/shelf/:activity",
    summary:
      "this subject's shelf for one activity: each item's key, hash and save time, never a body, and the cap",
    request: { path: { activity: "topik" } },
    expect: { status: 200, schema: ShelfListingSchema },
  }),

  defineContract({
    id: "shelf.unknown_activity",
    module: "shelf",
    session: true,
    method: "GET",
    path: "/shelf/:activity",
    summary: "an activity the shelf does not serve is a 404 to a read",
    request: { path: { activity: "contract-harness" } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "shelf.item_not_found",
    module: "shelf",
    session: true,
    method: "GET",
    path: "/shelf/:activity/:key",
    summary:
      "a key this subject did not keep is a JSON 404, the same answer whoever else kept it",
    request: { path: { activity: "leetype", key: ABSENT_KEY } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "shelf.keep_refused",
    module: "shelf",
    session: true,
    method: "PUT",
    path: "/shelf/:activity/:key",
    summary:
      "a body that is not a JSON object or array is a 422, and nothing is kept",
    mutates: true,
    request: {
      path: { activity: "topik", key: ABSENT_KEY },
      body: "not an object or array",
    },
    expect: { status: 422 },
  }),

  defineContract({
    id: "shelf.remove_absent",
    module: "shelf",
    session: true,
    method: "DELETE",
    path: "/shelf/:activity/:key",
    summary:
      "removing a key no one kept is a bodiless 204, as removing a kept one is",
    mutates: true,
    request: { path: { activity: "topik", key: ABSENT_KEY } },
    expect: { status: 204 },
  }),
]
