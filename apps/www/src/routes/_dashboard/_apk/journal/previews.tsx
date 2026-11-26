import type { JSX } from "react"
import { useState } from "react"
import { sampleTransitionsOffer } from "@some-ui/video-render"
import { createFileRoute } from "@tanstack/react-router"

import { PICK_WORDS, samplePicks } from "@/lib/preview-pick"
import { KIND_WORDS } from "@/lib/studio-index"
import { Part, StudioPage } from "@/components/studio/layout"
import { PreviewPick } from "@/components/studio/preview-pick"

/** The conversation the sample preview stands for until home offers real ones. */
const SAMPLE_CONVERSATION = "sample"

const OFFER = sampleTransitionsOffer()

/**
 * Studio's Previews (HOST16, #3558): the previews the agent offers for the
 * owner to approve, each pick kept as a rule. Until home offers a
 * conversation's previews (paulgsc/server#1243), it shows the transitions
 * preview (HOST18) as a sample, with no clip yet: its picks are held in
 * memory while the screen is open and never kept, since a pick on a fixture
 * is no approval. Home's previews will be picked through `phonePicks`.
 */
const Previews = (): JSX.Element => {
  // A sample's picks, held for as long as the screen is open.
  const [picks] = useState(samplePicks)
  return (
    <StudioPage
      heading={KIND_WORDS.previews.name}
      intro={PICK_WORDS.intro}
      back="index"
    >
      <Part label={OFFER.about}>
        <PreviewPick
          offer={OFFER}
          conversation={SAMPLE_CONVERSATION}
          picks={picks}
          clipSrc={() => null}
          now={() => new Date().toISOString()}
        />
      </Part>
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/previews")({
  component: Previews,
})
