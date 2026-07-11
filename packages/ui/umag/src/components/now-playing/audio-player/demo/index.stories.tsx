import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AudioStorageExample } from "."

type Story = StoryObj<typeof AudioStorageExample>
type Meta = MetaObj<typeof AudioStorageExample>

export const Default: Story = {}

const meta = {
  title: "UI/Umag/Components/AudioStorage/AudioStorageExample",
  component: AudioStorageExample,
} satisfies Meta

export default meta
