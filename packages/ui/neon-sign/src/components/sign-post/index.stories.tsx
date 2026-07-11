import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SignPost } from "."

type Story = StoryObj<typeof SignPost>
type Meta = MetaObj<typeof SignPost>

export const Default: Story = {}

const meta = {
  title: "UI/NeonSign/Components/SignPost",
  component: SignPost,
} satisfies Meta

export default meta
