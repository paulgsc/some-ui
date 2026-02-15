import {
  createTopikMetadataRepository,
  createTopikRepository,
  SessionConfigProvider,
} from "@chat/lib/topik"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { KoreanStudyPage } from "."

// 1. Initialize mock repositories for the story environment
const storyTopikRepository = createTopikRepository()
const storyMetadataRepository = createTopikMetadataRepository(
  "/topiks/manifest.json"
)

type Story = StoryObj<typeof KoreanStudyPage>
type Meta = MetaObj<typeof KoreanStudyPage>

export default {
  title: "UI/Chat/Components/Topik/KoreanStudyPage",
  component: KoreanStudyPage,
  decorators: [
    (Story) => (
      <SessionConfigProvider
        value={{
          topikRepository: storyTopikRepository,
          metadataRepository: storyMetadataRepository,
        }}
      >
        <Story />
      </SessionConfigProvider>
    ),
  ],
} as Meta

export const Default: Story = {}
