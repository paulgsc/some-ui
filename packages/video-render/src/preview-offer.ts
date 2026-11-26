/**
 * A preview the agent offers the owner to approve (HOST16, #3558; the
 * owner's guard on #3521: "we never become a video editor"). The owner never
 * sets a value: where a rule is new or in doubt, the agent renders two or
 * three variants of one bundle of related choices (the transitions, the
 * cast's framing), each moment called out on screen, recommends one, and
 * the owner picks one ("use this") or says what else they want. The offer
 * is conversation/2's `offer` event, the agent's (C1582), and the pick its
 * `approve` event, which names the offer's variant; the variant's rule is
 * then policy.
 *
 * A variant's clip plays muted and looping in its card; its callouts are
 * the "what's in it" list, the same words the clip shows on screen.
 */

import type { ConversationEvent, PreviewOffer } from "./conversation"

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
    ...(changes.moves === undefined ? {} : { moves: changes.moves }),
  }
  if (pick.kind === "else") {
    const said = pick.said.trim()
    return said === "" ? null : { ...base, chose: { kind: "else", said } }
  }
  return offer.variants.some((v) => v.variant === pick.variant)
    ? { ...base, chose: { kind: "variant", variant: pick.variant } }
    : null
}

/** The agent's offer of `offer`, at `at`, as the record keeps it. */
export const offerEvent = (
  offer: PreviewOffer,
  at: string
): Extract<ConversationEvent, { event: "offer" }> => ({
  event: "offer",
  by: "agent",
  at,
  offer,
})

/** A preview of the scene joins (HOST18, #3571): the first offer, and the fixture until home makes the clips. */
export const sampleTransitionsOffer = (): PreviewOffer => ({
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
