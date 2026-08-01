import type { JSX, ReactNode } from "react"
import { SpeechProvider, useSpeechAdapter } from "@some-ui/speech"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import {
  createTopikMetadataRepository,
  createTopikRepository,
  SessionConfigProvider,
} from "@topik/lib/topik"
import { cn } from "some-ui-utils"

import { KoreanStudyPage } from "."

// 1. Initialize mock repositories for the story environment
const storyTopikRepository = createTopikRepository()
const storyMetadataRepository = createTopikMetadataRepository(
  "/topiks/manifest.json"
)

/**
 * Storybook has no companion services, so the session is configured as
 * `static` - which `@some-ui/speech` resolves to the browser's own voice.
 * The story never names a backend, and it never built one out of a
 * hardcoded host and API key the way this decorator used to.
 */
const WithSessionConfig = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => (
  <SpeechProvider
    config={{ mode: "static", lang: "ko-KR" }}
    fallback={
      <div className={cn("flex items-center justify-center gap-3 p-4")}>
        <div
          className={cn("bg-primary/20 size-12 animate-pulse rounded-full")}
        />
        <span className={cn("text-muted-foreground animate-pulse font-medium")}>
          Waiting for TTS Provider
        </span>
      </div>
    }
  >
    <WithSessionAdapter>{children}</WithSessionAdapter>
  </SpeechProvider>
)

const WithSessionAdapter = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => (
  <SessionConfigProvider
    value={{
      topikRepository: storyTopikRepository,
      metadataRepository: storyMetadataRepository,
      speechAdapter: useSpeechAdapter(),
    }}
  >
    {children}
  </SessionConfigProvider>
)

type Story = StoryObj<typeof KoreanStudyPage>
type Meta = MetaObj<typeof KoreanStudyPage>

const meta: Meta = {
  title: "UI/Chat/Components/Topik/KoreanStudyPage",
  component: KoreanStudyPage,
  decorators: [
    (Story) => (
      <WithSessionConfig>
        <Story />
      </WithSessionConfig>
    ),
  ],
}
export default meta

export const Default: Story = {}
