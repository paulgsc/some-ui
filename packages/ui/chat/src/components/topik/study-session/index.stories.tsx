import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { KoreanStudyPage } from "."

type Story = StoryObj<typeof KoreanStudyPage>
type Meta = MetaObj<typeof KoreanStudyPage>

export const Default: Story = {
  args: {
    path: "topiks/unit-three.json",
  },
}

export default {
  title: "UI/Chat/Components/Topik/KoreanStudyPage",
  component: KoreanStudyPage,
} as Meta
