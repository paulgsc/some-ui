import { componentRegistry } from "@some-ui/content"
import {
  dramaTree,
  studyTree,
  topikTree,
  voiceTree,
} from "@some-ui/content/data/layout-tree"
import type { Meta, StoryObj } from "@storybook/react-vite"
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
  layoutTree?: typeof studyTree
  transitionMs?: number
  enableFocus?: boolean
}

const AnimatedStory = ({
  layoutTree = studyTree,
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
// Stories
// ============================================================================

export const StudyLayout: Story = {
  render: (args) => <AnimatedStory transitionMs={args.transitionMs} />,
  args: { layoutTree: studyTree, transitionMs: 300 },
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
  args: { transitionMs: 300, layoutTree: voiceTree },
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
  args: { transitionMs: 300, layoutTree: topikTree },
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
