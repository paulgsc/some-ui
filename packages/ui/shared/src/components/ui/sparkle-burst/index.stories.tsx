import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SparkleShowcase } from "./sparkle-showcase"

type Story = StoryObj<typeof SparkleShowcase>
type Meta = MetaObj<typeof SparkleShowcase>

export const Default: Story = {}

export default {
  title: "UI/Shared/Components/Sparkle/SparkleShowcase",
  component: SparkleShowcase,
} as Meta
