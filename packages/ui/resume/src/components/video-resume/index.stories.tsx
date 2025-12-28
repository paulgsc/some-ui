import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ResumeProfileCard } from "."

type Story = StoryObj<typeof ResumeProfileCard>
type Meta = MetaObj<typeof ResumeProfileCard>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/VideoResume/ResumeProfileCard",
  component: ResumeProfileCard,
} as Meta
