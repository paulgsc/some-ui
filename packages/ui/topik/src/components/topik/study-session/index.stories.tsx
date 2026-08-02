import type { JSX, ReactNode } from "react"
import { SpeechProvider } from "@some-ui/speech"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { KoreanStudyPage } from "."

/**
 * The whole decorator, now.
 *
 * It used to build the session config by hand - two repositories and an
 * adapter pulled out of the speech session through a second nested
 * component, because `useSpeechAdapter` is a hook and the config object
 * needed its return value. The applet assembles all of that itself; a story
 * only supplies what is genuinely environmental.
 *
 * Storybook has no companion services, so the session is `static`, which
 * `@some-ui/speech` resolves to the browser's own voice. Removing the
 * provider entirely would also work - the applet runs silently without one -
 * but a Korean lesson is worth hearing.
 */
const WithSpeech = ({ children }: { children: ReactNode }): JSX.Element => (
  <SpeechProvider config={{ mode: "static", lang: "ko-KR" }}>
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

/**
 * What the content registry mounts: no props, no providers, no host
 * knowledge of what this applet needs.
 */
export const AsMountedByTheRegistry: Story = {
  decorators: [(Story) => <Story />],
}
