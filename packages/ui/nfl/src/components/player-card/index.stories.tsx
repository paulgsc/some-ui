import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { NflPlayerCard } from "."

type Story = StoryObj<typeof NflPlayerCard>
type Meta = MetaObj<typeof NflPlayerCard>

export const Default: Story = {}

const meta = {
  title: "UI/NFL/Components/NflPlayerCard",
  component: NflPlayerCard,
} satisfies Meta

export default meta
