import { componentRegistry } from "@some-ui/content-registry"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { dramaTree } from "@wireframes/lib/layout-tree"
import { useSceneLifetimes } from "some-ui-utils"

import { OrchestratedYouTubeViewport } from "."

// ============================================================================
// Helper: AnimatedStory Wrapper
// Ensures all required props are passed
// ============================================================================

type AnimatedStoryProps = {
  transitionMs?: number
  enableFocus?: boolean
  layoutTree?: typeof dramaTree | null
}

const AnimatedStory = ({
  layoutTree = null,
  transitionMs = 300,
  enableFocus = true,
}: AnimatedStoryProps) => {
  const activeLifetimes = useSceneLifetimes()

  return (
    <div className="absolute inset-0">
      <OrchestratedYouTubeViewport
        layoutTree={layoutTree}
        activeLifetimes={activeLifetimes}
        componentRegistry={componentRegistry}
        transitionMs={transitionMs}
        enableFocus={enableFocus}
      />
    </div>
  )
}

// ============================================================================
// Meta Configuration
// ============================================================================

const meta = {
  title: "UI/Wireframes/OrchestratedYouTubeViewport",
  component: AnimatedStory,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Orchestrated YouTube Viewport

Each panel is a parent component that can contain multiple time-limited children.
        `,
      },
    },
  },
  argTypes: {
    transitionMs: {
      control: { type: "range", min: 0, max: 1000, step: 50 },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AnimatedStory>

export default meta
type Story = StoryObj<typeof meta>

// ============================================================================
// Stories
// ============================================================================

export const StudyLayout: Story = {
  render: (args) => <AnimatedStory transitionMs={args.transitionMs} />,
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story: "**Basic Layout** - Single parent per panel, single focus",
      },
    },
  },
}

export const DramaLayout: Story = {
  render: (args) => <AnimatedStory {...args} />,
  args: { layoutTree: dramaTree, transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story: "**Nested Components** - Parents with multiple children",
      },
    },
  },
}

export const VoiceLayout: Story = {
  render: (args) => <AnimatedStory {...args} />,
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story:
          "**Multiple Focus Regions** - Complex hierarchy with competing focus",
      },
    },
  },
}

export const TopikLayout: Story = {
  render: (args) => <AnimatedStory {...args} />,
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story:
          "**Multiple Focus Regions** - Complex hierarchy with competing focus",
      },
    },
  },
}

export const ChildrenOnly: Story = {
  render: (args) => <AnimatedStory transitionMs={args.transitionMs} />,
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story: "**Children Without Focus** - Pure hierarchical composition",
      },
    },
  },
}
