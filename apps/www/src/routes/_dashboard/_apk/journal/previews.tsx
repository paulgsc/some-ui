import type { JSX } from "react"
import { sampleTransitionsOffer } from "@some-ui/video-render"
import { createFileRoute } from "@tanstack/react-router"

import { phonePicks, PICK_WORDS } from "@/lib/preview-pick"
import { KIND_WORDS } from "@/lib/studio-index"
import { Part, StudioPage } from "@/components/studio/layout"
import { PreviewPick } from "@/components/studio/preview-pick"

/** The conversation the sample preview stands for until home offers real ones. */
const SAMPLE_CONVERSATION = "sample"

const OFFER = sampleTransitionsOffer()

/**
 * Studio's Previews (HOST16, #3558): the previews the agent offers for the
 * owner to approve, each picked once and kept as a rule. Until home offers
 * a conversation's previews (paulgsc/server#1243), it shows the transitions
 * preview (HOST18) with no clip yet, and keeps the pick on this phone.
 */
const Previews = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.previews.name}
    intro={PICK_WORDS.intro}
    back="index"
  >
    <Part label={OFFER.about}>
      <PreviewPick
        offer={OFFER}
        conversation={SAMPLE_CONVERSATION}
        picks={phonePicks()}
        clipSrc={() => null}
        now={() => new Date().toISOString()}
      />
    </Part>
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/previews")({
  component: Previews,
})
