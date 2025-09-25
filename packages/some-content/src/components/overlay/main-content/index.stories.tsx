import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { OrchestratedMainContent } from "."

type Story = StoryObj<typeof OrchestratedMainContent>
type Meta = MetaObj<typeof OrchestratedMainContent>

export const Default: Story = {}

export default {
  title: "UI/Content/OrchestratedMainContent",
  component: OrchestratedMainContent,
} as Meta
