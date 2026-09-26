import type { JSX, ReactNode } from "react"
import { SpeechProvider } from "@some-ui/speech"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { KoreanStudyPage } from "@topik/components/topik/study-session"

import { fixtureMetadataRepository, fixtureTopikRepository } from "./fixture"

const WithSpeech = ({ children }: { children: ReactNode }): JSX.Element => (
  <SpeechProvider config={{ mode: "static", lang: "ko-KR" }}>
    {children}
  </SpeechProvider>
)

type Story = StoryObj<typeof KoreanStudyPage>
type Meta = MetaObj<typeof KoreanStudyPage>

/**
 * The whole applet, pinned to the handheld renderer and fed a fixture topik,
 * so the lesson can be walked end to end without companion data. Resize the
 * canvas past `md` with `surface: "auto"` to watch the desktop session take
 * over instead.
 */
const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/Lesson",
  component: KoreanStudyPage,
  args: {
    surface: "handheld",
    topikRepository: fixtureTopikRepository,
    metadataRepository: fixtureMetadataRepository,
  },
  // The applet owns the whole screen on a phone; Storybook's padding would
  // push its dock below the fold and misreport the layout.
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <WithSpeech>
        <div className="relative h-svh w-full">
          <Story />
        </div>
      </WithSpeech>
    ),
  ],
}
export default meta

export const Handheld: Story = {}

/** Chosen by the room the applet was given. */
export const Auto: Story = { args: { surface: "auto" } }
