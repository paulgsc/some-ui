import { componentRegistry } from "@some-ui/content-registry"
import { useSceneDrivenLayout } from "@some-ui/content-registry/hooks/use-scene-driven-layout"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { dramaTree } from "@wireframes/lib/layout-tree"
import { useSceneLifetimes } from "some-ui-utils"

import { OrchestratedYouTubeViewport } from "."

// ============================================================================
// Meta Configuration
// ============================================================================

const meta = {
  title: "UI/Wireframes/OrchestratedYouTubeViewport",
  component: OrchestratedYouTubeViewport,
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
} satisfies Meta<typeof OrchestratedYouTubeViewport>

export default meta
type Story = StoryObj<typeof meta>

// ============================================================================
// Helper: AnimatedStory Wrapper
// Ensures all required props are passed
// ============================================================================

type AnimatedStoryProps = {
  transitionMs?: number
  enableFocus?: boolean
  layoutTree?: typeof dramaTree
}

const AnimatedStory = ({
  layoutTree,
  transitionMs = 300,
  enableFocus = true,
}: AnimatedStoryProps) => {
  const activeLifetimes = useSceneLifetimes()
  const { currentLayout } = useSceneDrivenLayout()

  return (
    <div className="absolute inset-0">
      <OrchestratedYouTubeViewport
        layoutTree={layoutTree ?? currentLayout}
        activeLifetimes={activeLifetimes}
        componentRegistry={componentRegistry}
        transitionMs={transitionMs}
        enableFocus={enableFocus}
      />
    </div>
  )
}

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
