/**
 * The owner's picks on the agent's previews (HOST16, #3558; the owner's
 * guard on #3521: the owner never sets a value, only approves a preview,
 * which becomes a rule). A pick is conversation/2's `approve` event on the
 * agent's `offer` (C1582), made whole by `approveEvent`, and kept where the
 * record is: on home (`lib/preview-home`), the default store (#2182). The
 * screen runs on `./model` and `./runtime` (R1), over a `PreviewSource`.
 *
 * The sample (`sampleSource`) stands in while home offers none: HOST18's
 * transitions preview, its picks held in memory for as long as the screen
 * is open and never kept, since a pick on a fixture is no approval.
 */
import type { HomeWrite } from "@some-ui/soundbites"
import type { KeptChoice, PreviewOffer } from "@some-ui/video-render"
import { sampleTransitionsOffer } from "@some-ui/video-render"

import type { ConversationPreviews } from "./model"
import type { PreviewSource } from "./runtime"

export { PICK_WORDS } from "./words"
export type {
  ConversationPreviews,
  OfferedPreview,
  PickOutcome,
  PreviewsState,
} from "./model"
export { stepPreviews } from "./model"
export type { PreviewSource, PreviewsRuntime } from "./runtime"
export { previewsRuntime } from "./runtime"

/** The sample's one conversation. */
export const SAMPLE_CONVERSATION = "sample"

/**
 * The sample: `offer` as one conversation, its picks held in memory and
 * never kept. A pick that changes the standing one names it as moved, as
 * home's record requires (C1581).
 */
export function sampleSource(
  offer: PreviewOffer = sampleTransitionsOffer()
): PreviewSource {
  let standing: KeptChoice | null = null
  const now = (): ConversationPreviews => ({
    id: SAMPLE_CONVERSATION,
    topic: offer.about,
    previews: [{ ...offer, clips: {}, standing }],
    unshown: 0,
  })
  return {
    where: "sample",
    read: () => Promise.resolve({ kind: "read", value: [now()] }),
    approve: (
      conversation,
      event
    ): Promise<HomeWrite<ConversationPreviews | null>> => {
      const refused = { kind: "refused" } as const
      if (
        conversation !== SAMPLE_CONVERSATION ||
        event.preview !== offer.preview
      )
        return Promise.resolve(refused)
      if (standing !== null && event.moves !== offer.preview)
        return Promise.resolve(refused)
      const { chose } = event
      if (chose.kind === "else") standing = chose
      else {
        const variant = offer.variants.find((v) => v.variant === chose.variant)
        if (variant === undefined) return Promise.resolve(refused)
        standing = {
          kind: "variant",
          variant: variant.variant,
          rule: variant.rule,
        }
      }
      return Promise.resolve({ kind: "written", value: now() })
    },
  }
}
