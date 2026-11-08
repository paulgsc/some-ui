import type { JSX } from "react"
import { homeHearing } from "@some-ui/soundbites"
import { answerRef } from "@some-ui/video-render"
import { onPageVisibility } from "@some-ui/voice-capture"
import { createFileRoute } from "@tanstack/react-router"

import { homeLink, pairingOf } from "@/lib/home-link"
import { phoneHomeListener } from "@/lib/idea-hearing"
import type { StudioAsk } from "@/lib/studio-asks"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { AskAnswer } from "@/components/studio/ask-answer"
import { AskScreen } from "@/components/studio/asks"
import { StudioPage } from "@/components/studio/layout"

const device = import.meta.env.VITE_DEVICE_BACKEND === "true"

/**
 * In the Android app, an ask is answered by voice: a take home hears, kept
 * under the ask's ref (SFEED5, `lib/ask-answer`).
 */
const answer = device
  ? (ask: StudioAsk): JSX.Element => (
      <AskAnswer
        key={ask.id}
        ports={{
          listener: phoneHomeListener(homeHearing),
          loaded: () => homeLink().load(),
          paired: () => pairingOf() !== null,
          onVisibility: onPageVisibility,
        }}
        answers={answerRef(ask)}
      />
    )
  : undefined

/** One ask (SFEED1, #2731), by its repository and number. */
const AskPage = (): JSX.Element => {
  const { ask }: { ask: string } = Route.useParams()
  return (
    <StudioPage heading={STUDIO_INDEX_WORDS.asks.heading} back="asks">
      <AskScreen id={ask} answer={answer} />
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/asks/$ask")({
  component: AskPage,
})
