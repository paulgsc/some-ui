import { componentRegistry } from "@some-ui/content"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import type { YouTubeRegion } from "some-types-utils"
import {
  selectCurrentTime,
  selectTotalDuration,
  useOrchestratorStore,
  useSceneLifetimes,
} from "some-ui-utils"

import { OrchestratedYouTubeViewport } from "."

// ============================================================================
// Mock Youtube tree
// ============================================================================
const layoutTree: LayoutNode<YouTubeRegion> = {
  type: "split",
  axis: "col",
  splitId: "split-0",
  children: [
    {
      node: {
        type: "leaf",
        id: "title",
      },
      weight: 0.17333333333333323,
    },
    {
      node: {
        type: "split",
        axis: "row",
        splitId: "split-1",
        children: [
          {
            node: {
              type: "leaf",
              id: "mainContent",
            },
            weight: 1.6146625766871165,
          },
          {
            node: {
              type: "split",
              axis: "col",
              splitId: "split-2",
              children: [
                {
                  node: {
                    type: "leaf",
                    id: "sidebarTop",
                  },
                  weight: 0.36496350364963503,
                },
                {
                  node: {
                    type: "leaf",
                    id: "sidebarBottom",
                  },
                  weight: 1.635036496350365,
                },
              ],
            },
            weight: 0.38533742331288345,
          },
        ],
      },
      weight: 1.8266666666666667,
    },
  ],
}

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

**Key Architecture Insight**: Each panel is a parent component that can contain multiple time-limited children.

- 🎯 **Panel = Parent + Focus**: Each panel has one parent component (registry_key) and optional focus
- 🌲 **Hierarchical Children**: Parents can contain multiple children with individual durations
- ⏱️ **Time-Scoped Components**: Children have \`duration\` fields controlling their lifecycle
- 🔒 **Focus Inheritance**: Focus applies to the entire panel (parent + all children)

## Architecture

\`\`\`
Panel {
  registry_key: "parentComponent",  // The parent/base component
  focus: { region, intensity },     // Optional focus for entire panel
  children: [                       // Optional nested components
    { registry_key, props, duration },
    { registry_key, props, duration }
  ]
}
\`\`\`
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
// Helper: Animated Orchestrator State
// ============================================================================

// ============================================================================
// Story Wrapper
// ============================================================================

const AnimatedStory = ({
  scene,
  transitionMs = 300,
}: {
  scene: string
  transitionMs?: number
}) => {
  const totalDuration = useOrchestratorStore(selectTotalDuration)
  const currTime = useOrchestratorStore(selectCurrentTime)
  const activeLifetimes = useSceneLifetimes()

  return (
    <div className="w-full h-screen">
      <OrchestratedYouTubeViewport
        activeLifetimes={activeLifetimes}
        componentRegistry={componentRegistry}
        transitionMs={transitionMs}
        layoutTree={layoutTree}
      />
    </div>
  )
}

// ============================================================================
// Stories - Focused Edge Case Coverage
// ============================================================================

export const BasicLayout: Story = {
  render: (args) => (
    <AnimatedStory scene="basicLayout" transitionMs={args.transitionMs} />
  ),
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story: `
**Basic Layout** - Single parent per panel, single focus

- Each panel has only a parent component (no children)
- Video panel has focus at 70% intensity
- Demonstrates simple parent-only panel structure
        `,
      },
    },
  },
}

export const NestedComponents: Story = {
  render: (args) => (
    <AnimatedStory scene="nestedComponents" transitionMs={args.transitionMs} />
  ),
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story: `
**Nested Components** - Parents with multiple children

- Video panel: parent (hangul) + 3 children (badge, progress, controls)
- MainContent panel: parent (brickChart) + 1 child (tooltip)
- SidebarTop panel: parent (scheduleElements) + 1 child (notification)
- Children have individual durations (5s, 10s, 15s, etc.)
- Focus on video panel applies to parent + all children
        `,
      },
    },
  },
}

export const MultiFocus: Story = {
  render: (args) => (
    <AnimatedStory scene="multiFocus" transitionMs={args.transitionMs} />
  ),
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story: `
**Multiple Focus Regions** - Complex hierarchy with competing focus

- Title panel: 30% focus intensity
- Video panel: 80% focus intensity + 2 children
- MainContent panel: 50% focus intensity + 1 child
- FooterLeft panel: no focus + 1 child
- Demonstrates focus resolution with multiple competing regions
        `,
      },
    },
  },
}

export const ChildrenOnly: Story = {
  render: (args) => (
    <AnimatedStory scene="childrenOnly" transitionMs={args.transitionMs} />
  ),
  args: { transitionMs: 300 },
  parameters: {
    docs: {
      description: {
        story: `
**Children Without Focus** - Pure hierarchical composition

- No panels declare focus (all equal emphasis)
- Video panel: parent + 2 children (watermark, timer)
- MainContent panel: parent + 1 child (gridOverlay)
- All children span full scene duration (15s)
- Demonstrates children can exist without focus
        `,
      },
    },
  },
}
