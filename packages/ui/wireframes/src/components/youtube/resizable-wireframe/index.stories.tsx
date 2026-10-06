import { componentRegistry } from "@some-ui/content-registry"
import type { ActiveLifetime } from "@some-ui/types"
import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  dramaTree,
  studyTree,
  topikTree,
  voiceTree,
} from "@wireframes/lib/layout-tree"

import { OrchestratedYouTubeViewport } from "."

// No orchestrator runs in Storybook, so no scene is ever live: every region
// shows its placeholder box. Module-level so the array keeps one identity.
const activeLifetimes: Array<ActiveLifetime> = []

type AnimatedStoryProps = {
  transitionMs?: number
  enableFocus?: boolean
  layoutTree?: typeof dramaTree
}

const AnimatedStory = ({
  layoutTree = studyTree,
  transitionMs = 300,
  enableFocus = true,
}: AnimatedStoryProps) => {
  return (
    <div className="absolute inset-0">
      <OrchestratedYouTubeViewport
        layoutTree={layoutTree}
        activeLifetimes={activeLifetimes}
        componentRegistry={componentRegistry}
        transitionMs={transitionMs}
        enableFocus={enableFocus}
        // These stories exist to visualize every named region - keep
        // showing placeholder boxes rather than zero-collapsing (story 5).
        collapseUnbound={false}
      />
    </div>
  )
}

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
  args: { layoutTree: voiceTree, transitionMs: 300 },
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
  args: { layoutTree: topikTree, transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story:
          "**Multiple Focus Regions** - Complex hierarchy with competing focus",
      },
    },
  },
}
