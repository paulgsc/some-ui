/**
 * A preview the agent offers the owner to approve (HOST16, #3558; the
 * owner's guard on #3521: "we never become a video editor"). The owner never
 * sets a value: where a rule is new or in doubt, the agent renders two or
 * three variants of one bundle of related choices (the transitions, the
 * cast's framing), each moment called out on screen, recommends one, and
 * the owner picks one ("use this") or says what else they want. The pick is
 * conversation/2's `approve` event, and the variant's rule is then policy.
 *
 * A variant's clip plays muted and looping in its card; its callouts are
 * the "what's in it" list, the same words the clip shows on screen.
 */

import { z } from "zod"

import type { ConversationEvent } from "./conversation"
import { PREVIEW_VARIANTS_MOST } from "./conversation"
import type { Parsed } from "./cut-list"
import { problemsOf } from "./cut-list"
import { words } from "./format"

const Name = z.string().trim().min(1).max(64)

/** One variant of a preview: its clip, what it shows, and the rule picking it sets. */
export const PreviewVariantSchema = z.strictObject({
  id: Name,
  /** What it is, in a few words: "Crossfade". */
  title: words.max(60),
  /** The clip, as home keeps it beside the preview. */
  clip: z.string().trim().min(1).max(200),
  /** Each moment the clip shows, as its on-screen callout says it. */
  callouts: z
    .array(
      z.strictObject({
        atMs: z.number().int().nonnegative(),
        says: words.max(80),
      })
    )
    .min(1)
    .max(12),
  /** The rule this variant sets once picked. */
  rule: Name,
})

export type PreviewVariant = z.infer<typeof PreviewVariantSchema>

/** A preview offered on a conversation: what it bundles, its variants, and the one recommended. */
export const PreviewOfferSchema = z
  .strictObject({
    id: Name,
    /** The family of choices it bundles, as the card's heading says it. */
    about: words.max(80),
    variants: z.array(PreviewVariantSchema).min(2).max(PREVIEW_VARIANTS_MOST),
    recommended: Name,
  })
  .refine(
    (o) => new Set(o.variants.map((v) => v.id)).size === o.variants.length,
    "two variants share an id"
  )
  .refine(
    (o) => o.variants.some((v) => v.id === o.recommended),
    "the recommended variant isn't one offered"
  )

export type PreviewOffer = z.infer<typeof PreviewOfferSchema>

/** An offer as read, or every reason it can't be shown. */
export function parsePreviewOffer(raw: unknown): Parsed<PreviewOffer> {
  const parsed = PreviewOfferSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "preview") }
}

/** What the owner did on a preview: used a variant, or said something else. */
export type PreviewPick =
  | { readonly kind: "variant"; readonly variant: string }
  | { readonly kind: "else"; readonly said: string }

/**
 * The owner's pick on `offer` as conversation/2's `approve` event, at `at`;
 * null for a variant the offer doesn't hold, or something else said in no
 * words.
 */
export function approveEvent(
  offer: PreviewOffer,
  pick: PreviewPick,
  at: string
): Extract<ConversationEvent, { event: "approve" }> | null {
  const base = {
    event: "approve" as const,
    at,
    preview: offer.id,
    offered: offer.variants.map((v) => v.id),
    recommended: offer.recommended,
  }
  if (pick.kind === "else") {
    const said = pick.said.trim()
    return said === "" ? null : { ...base, chose: { kind: "else", said } }
  }
  const variant = offer.variants.find((v) => v.id === pick.variant)
  return variant === undefined
    ? null
    : {
        ...base,
        chose: { kind: "variant", variant: variant.id, rule: variant.rule },
      }
}

/** A preview of the scene joins (HOST18, #3571): the first offer, and the fixture until home makes the clips. */
export const sampleTransitionsOffer = (): PreviewOffer => ({
  id: "transitions-1",
  about: "How one scene gives way to the next",
  recommended: "crossfade",
  variants: [
    {
      id: "crossfade",
      title: "Crossfade",
      clip: "transitions-1/crossfade.mp4",
      callouts: [
        { atMs: 1_500, says: "Transition: crossfade" },
        { atMs: 4_500, says: "New chapter: slow crossfade" },
      ],
      rule: "joins-crossfade",
    },
    {
      id: "dip-to-black",
      title: "Dip to black",
      clip: "transitions-1/dip-to-black.mp4",
      callouts: [
        { atMs: 1_500, says: "Transition: crossfade" },
        { atMs: 4_500, says: "New chapter: dip to black" },
      ],
      rule: "joins-dip-at-chapters",
    },
  ],
})
