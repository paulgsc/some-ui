import type { JSX } from "react"
import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { homePreviews } from "@/lib/preview-home"
import { PICK_WORDS, previewsRuntime, sampleSource } from "@/lib/preview-pick"
import type { PreviewsRuntime } from "@/lib/preview-pick"
import { KIND_WORDS } from "@/lib/studio-index"
import { StudioPage } from "@/components/studio/layout"
import { Previews } from "@/components/studio/preview-pick"

const now = (): string => new Date().toISOString()

/** A runtime made once per mount, read as soon as the screen opens. */
function useOpened(initialMake: () => PreviewsRuntime): PreviewsRuntime {
  // A runtime made once per mount: its own waits are its own (R1).
  const [runtime] = useState(initialMake)
  useEffect(() => {
    runtime.open()
  }, [runtime])
  return runtime
}

/**
 * Studio's Previews (HOST16, #3558): the previews the agent offers on
 * home's conversations, for the owner to approve, each pick kept on home
 * as the record's approval and a rule after it. Below them, HOST18's
 * transitions preview as a sample, its picks held in memory while the
 * screen is open and never kept, since a pick on a fixture is no approval.
 */
const PreviewsScreen = (): JSX.Element => {
  const home = useOpened(() => previewsRuntime(homePreviews, now))
  const sample = useOpened(() => previewsRuntime(sampleSource(), now))
  return (
    <StudioPage
      heading={KIND_WORDS.previews.name}
      intro={PICK_WORDS.intro}
      back="index"
    >
      <Previews previews={home} />
      <Previews previews={sample} />
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/previews")({
  component: PreviewsScreen,
})
