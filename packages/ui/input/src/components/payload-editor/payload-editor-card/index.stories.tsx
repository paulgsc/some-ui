import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { PayloadEditorCard } from "."

type Story = StoryObj<typeof PayloadEditorCard>
type Meta = MetaObj<typeof PayloadEditorCard>

export const Default: Story = {
  args: {},
}

const meta = {
  title: "UI/Input/Components/PayloadEditor/PayloadEditorCard",
  component: PayloadEditorCard,
} satisfies Meta

export default meta
