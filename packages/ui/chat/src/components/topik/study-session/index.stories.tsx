import { useEffect, useState } from "react"
import {
  createTopikMetadataRepository,
  createTopikRepository,
  SessionConfigProvider,
} from "@chat/lib/topik"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { cn, useAudioTTS } from "some-ui-utils"

import { KoreanStudyPage } from "."

// 1. Initialize mock repositories for the story environment
const storyTopikRepository = createTopikRepository()
const storyMetadataRepository = createTopikMetadataRepository(
  "/topiks/manifest.json"
)

const WithSessionConfig = ({ children }: { children: React.ReactNode }) => {
  const [isSpeechContextReady, setIsSpeechContextReady] = useState(false)
  const audioTTS = useAudioTTS({
    service: {
      provider: "openai",
      apiUrl: "http://nixos.local:5050/v1/audio/speech",
      apiKey: "your_dummy_api_key_here",
      format: "mp3",
      timeout: 30_000,
    },
    voice: {
      id: "ko-KR-SunHiNeural",
      name: "Sun-Hi (Korean Female)",
      provider: "openai",
      language: "ko-KR",
      gender: "female",
    },
    autoPlay: true,
  })

  useEffect(() => {
    if (audioTTS.supported) {
      try {
        // Speech context initialized for Storybook
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log("Speech context already initialized or error:", error)
      } finally {
        setIsSpeechContextReady(true)
      }
    }
  }, [audioTTS.supported]) // Only depend on supported, not the entire hook

  if (!isSpeechContextReady) {
    const message = "Waiting for TTS Provider"

    // You can return a loading spinner, a placeholder, or null

    return (
      <div className={cn("flex items-center justify-center gap-3 p-4")}>
        <div
          className={cn("bg-primary/20 size-12 animate-pulse rounded-full")}
        />

        <span className={cn("text-muted-foreground animate-pulse font-medium")}>
          {message}
        </span>
      </div>
    )
  }

  return (
    <SessionConfigProvider
      value={{
        topikRepository: storyTopikRepository,
        metadataRepository: storyMetadataRepository,
        audioTTS,
      }}
    >
      {children}
    </SessionConfigProvider>
  )
}

type Story = StoryObj<typeof KoreanStudyPage>
type Meta = MetaObj<typeof KoreanStudyPage>

export default {
  title: "UI/Chat/Components/Topik/KoreanStudyPage",
  component: KoreanStudyPage,
  decorators: [
    (Story) => (
      <WithSessionConfig>
        <Story />
      </WithSessionConfig>
    ),
  ],
} as Meta

export const Default: Story = {}
