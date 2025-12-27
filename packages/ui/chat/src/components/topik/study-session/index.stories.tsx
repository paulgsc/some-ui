import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { KoreanStudyPage } from "."

type Story = StoryObj<typeof KoreanStudyPage>
type Meta = MetaObj<typeof KoreanStudyPage>

export const Default: Story = {}

export default {
  title: "UI/Chat/Components/Topik/KoreanStudyPage",
  component: KoreanStudyPage,
} as Meta
