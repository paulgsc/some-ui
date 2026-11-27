/**
 * Home, as KPLAY's shop asks it (KP4, #2853): the `ShopPort`'s look-up over
 * the link's one request per hunch (`lib/home-link/phrase-lookup`, LA8),
 * each answer read as paulgsc/server's `handlers::phrases` (#1265) means it.
 * Anything but a read answer rejects, which the shop's runtime says as
 * home not reached, and the hunch may be sent again. Phone-only.
 */
import type { Lookup, ShopPort } from "@some-ui/topik"
import { z } from "zod"

import { askFastTrack } from "@/lib/home-link/fast-track"
import { askHeard } from "@/lib/home-link/heard"
import { readHome } from "@/lib/home-link/home-read"
import { askLookup } from "@/lib/home-link/phrase-lookup"
import { phoneHunchTakes } from "@/lib/hunch-takes"

import { hearOnHome } from "./hear"
import { hunchOutbox } from "./outbox"

/** `POST /phrases/lookup`'s `200`: the phrases that do it, or kept. */
const LookupSchema: z.ZodType<Lookup> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hit"), phrases: z.array(z.string().min(1)) }),
  z.object({ kind: z.literal("kept") }),
])

/** The shop's look-up on home; rejects when home gave no readable answer. */
async function lookUpOnHome(words: string, hunch: string): Promise<Lookup> {
  const read = await readHome(() => askLookup({ words, hunch }), LookupSchema)
  if (read.kind === "read") return read.value
  throw new Error(`home's look-up: ${read.kind}`)
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** The Android app's shop on home. */
export const phoneShop: ShopPort = {
  takes: phoneHunchTakes(),
  lookUp: lookUpOnHome,
  keep: hunchOutbox.keep,
  hear: (note, _hunch, gone) =>
    hearOnHome(
      note,
      { fastTrack: askFastTrack, heard: askHeard, wait, now: Date.now },
      gone
    ),
}
