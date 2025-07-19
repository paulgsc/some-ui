import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { PayloadEditorCard } from "."

type Story = StoryObj<typeof PayloadEditorCard>
type Meta = MetaObj<typeof PayloadEditorCard>

export const Default: Story = {
  args: {
    className: "size-full",
  },
}

export default {
  title: "UI/Input/Components/PayloadEditor/PayloadEditorCard",
  component: PayloadEditorCard,
} as Meta
