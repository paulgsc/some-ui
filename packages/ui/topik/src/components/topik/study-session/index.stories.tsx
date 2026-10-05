import type { JSX, ReactNode } from "react"
import { SpeechProvider } from "@some-ui/speech"
import { webSpeech } from "@some-ui/speech/web-speech"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { KoreanStudyPage } from "."

/**
 * The applet assembles its own session config; a story supplies only what is
 * environmental.
 *
 * Storybook has no companion services, so the session is `static`, which
 * `@some-ui/speech` resolves to the browser's own voice. Removing the
 * provider entirely would also work - the applet runs silently without one -
 * but a Korean lesson is worth hearing.
 */
const WithSpeech = ({ children }: { children: ReactNode }): JSX.Element => (
  <SpeechProvider
    config={{
      mode: "static",
      language: "korean",
      adapters: { static: webSpeech },
    }}
  >
    {children}
  </SpeechProvider>
)

type Story = StoryObj<typeof KoreanStudyPage>
type Meta = MetaObj<typeof KoreanStudyPage>

const meta: Meta = {
  title: "UI/Chat/Components/Topik/KoreanStudyPage",
  component: KoreanStudyPage,
  decorators: [
    (Story) => (
      <WithSpeech>
        <Story />
      </WithSpeech>
    ),
  ],
}
export default meta

export const Default: Story = {}
