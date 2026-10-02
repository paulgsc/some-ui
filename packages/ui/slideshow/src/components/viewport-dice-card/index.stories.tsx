import { componentRegistry } from "@some-ui/content-registry"
import type { ViewportConfig } from "@some-ui/types"
import { PolyhedronFactory } from "@some-ui/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ViewportDiceCard } from "."

const meta: Meta<typeof ViewportDiceCard> = {
  title: "UI/Slideshow/Components/ViewportDiceCard",
  component: ViewportDiceCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    facesAhead: {
      control: { type: "number", min: 1, max: 5 },
      description: "Number of faces ahead to preload",
    },
  },
}

export default meta
type Story = StoryObj<typeof ViewportDiceCard>

// ============================================================================
// Sample Viewport Configs with registry descriptors
// ============================================================================

const simpleCubeConfig: ViewportConfig = {
  id: "simple-cube",
  items: [
    {
      kind: "neon",
      contentIndex: 0,
      durationMs: 30_000,
      props: {},
    },
    {
      kind: "neon",
      contentIndex: 1,
      durationMs: 30_000,
      props: {},
    },
    {
      kind: "neon",
      contentIndex: 2,
      durationMs: 30_000,
      props: {},
    },
  ],
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 1,
  cycleName: "cube:y",
}

// ============================================================================
// Stories
// ============================================================================

export const SimpleCube: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    registry: componentRegistry,
    facesAhead: 1,
  },
}
