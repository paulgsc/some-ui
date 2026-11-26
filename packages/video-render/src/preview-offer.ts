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

/** One variant of a preview: what it is, what its clip shows, and the rule picking it sets. Its clip is home's `<variant>.mp4` beside the preview. */
export const PreviewVariantSchema = z.strictObject({
  variant: Name,
  /** What it is, in a few words: "Crossfade". */
  title: words.max(60),
  /** Each moment the clip shows, as its on-screen callout says it. */
  callouts: z
    .array(words.max(80))
    .min(1)
    .max(12)
    .refine((c) => new Set(c).size === c.length, "a callout is listed twice"),
  /** The rule this variant sets once picked. */
  rule: Name,
})

export type PreviewVariant = z.infer<typeof PreviewVariantSchema>

/** The schema a preview's manifest names, as home keeps it beside its clips. */
export const PREVIEW_OFFER_SCHEMA = "some-ui.conversation-preview/1"

/** A preview offered on a conversation: what it bundles, its variants, and the one recommended. */
export const PreviewOfferSchema = z
  .strictObject({
    schema: z.literal(PREVIEW_OFFER_SCHEMA),
    preview: Name,
    /** The family of choices it bundles, as the card's heading says it. */
    about: words.max(80),
    variants: z.array(PreviewVariantSchema).min(2).max(PREVIEW_VARIANTS_MOST),
    recommended: Name,
  })
  .refine(
    (o) => new Set(o.variants.map((v) => v.variant)).size === o.variants.length,
    "two variants share an id"
  )
  .refine(
    (o) => new Set(o.variants.map((v) => v.rule)).size === o.variants.length,
    "two variants set the same rule, so picking between them decides nothing"
  )
  .refine(
    (o) => o.variants.some((v) => v.variant === o.recommended),
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
 * words. A pick that changes an earlier one on the same preview `moves` it
 * (C1581): the earlier stays kept, and this one is the rule.
 */
export function approveEvent(
  offer: PreviewOffer,
  pick: PreviewPick,
  at: string,
  changes: { readonly moves?: string } = {}
): Extract<ConversationEvent, { event: "approve" }> | null {
  const base = {
    event: "approve" as const,
    by: "owner" as const,
    at,
    preview: offer.preview,
    offered: offer.variants.map((v) => v.variant),
    recommended: offer.recommended,
    ...(changes.moves === undefined ? {} : { moves: changes.moves }),
  }
  if (pick.kind === "else") {
    const said = pick.said.trim()
    return said === "" ? null : { ...base, chose: { kind: "else", said } }
  }
  const variant = offer.variants.find((v) => v.variant === pick.variant)
  return variant === undefined
    ? null
    : {
        ...base,
        chose: {
          kind: "variant",
          variant: variant.variant,
          rule: variant.rule,
        },
      }
}

/** A preview of the scene joins (HOST18, #3571): the first offer, and the fixture until home makes the clips. */
export const sampleTransitionsOffer = (): PreviewOffer => ({
  schema: PREVIEW_OFFER_SCHEMA,
  preview: "transitions-1",
  about: "How one scene gives way to the next",
  recommended: "crossfade",
  variants: [
    {
      variant: "crossfade",
      title: "Crossfade",
      callouts: ["Transition: crossfade", "New chapter: slow crossfade"],
      rule: "joins-crossfade",
    },
    {
      variant: "dip-to-black",
      title: "Dip to black",
      callouts: ["Transition: crossfade", "New chapter: dip to black"],
      rule: "joins-dip-at-chapters",
    },
  ],
})
