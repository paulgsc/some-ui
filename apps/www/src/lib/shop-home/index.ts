/**
 * Home, as KPLAY's shop asks it (KP4, #2853): the `ShopPort`'s look-up over
 * the link's one request per hunch (`lib/home-link/phrase-lookup`, LA8),
 * each answer read as paulgsc/server's `handlers::phrases` (#1265) means it.
 * Anything but a read answer rejects, which the shop's runtime says as
 * home not reached, and the hunch may be sent again. Phone-only.
 */
import type { Lookup } from "@some-ui/topik"
import { z } from "zod"

import { readHome } from "@/lib/home-link/home-read"
import { askLookup } from "@/lib/home-link/phrase-lookup"

/** `POST /phrases/lookup`'s `200`: the phrases that do it, or kept. */
const LookupSchema: z.ZodType<Lookup> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hit"), phrases: z.array(z.string().min(1)) }),
  z.object({ kind: z.literal("kept") }),
])

/** The shop's look-up on home; rejects when home gave no readable answer. */
export async function lookUpOnHome(
  words: string,
  hunch: string
): Promise<Lookup> {
  const read = await readHome(() => askLookup({ words, hunch }), LookupSchema)
  if (read.kind === "read") return read.value
  throw new Error(`home's look-up: ${read.kind}`)
}
