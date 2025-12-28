import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AudioStorageExample } from "."

type Story = StoryObj<typeof AudioStorageExample>
type Meta = MetaObj<typeof AudioStorageExample>

export const Default: Story = {}

export default {
  title: "UI/Umag/Components/AudioStorage/AudioStorageExample",
  component: AudioStorageExample,
} as Meta
