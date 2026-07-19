import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { CodeSnippet } from "."

type Story = StoryObj<typeof CodeSnippet>
type Meta = MetaObj<typeof CodeSnippet>

export const Default: Story = {}

const meta = {
  title: "UI/Slideshow/Components/Recap/CodeSnippet",
  component: CodeSnippet,
} satisfies Meta

export default meta
