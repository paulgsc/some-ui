import { useEffect, useState } from "react"
import { componentRegistry } from "@some-ui/content"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { OrchestratorState, SceneConfig } from "some-types-utils"

import { OrchestratedYouTubeViewport } from "."

// ============================================================================
// Mock Scene Registry
// ============================================================================

const mockSceneRegistry: Record<string, SceneConfig> = {
  // Single parent per panel, no children
  basicLayout: {
    scene_name: "basicLayout",
    duration: 30_000,
    start_time: 0,
    ui: [
      {
        panels: {
          title: {
            registryKey: "cube",
            props: { region: "title", faceCapacity: 1 },
          },
          video: {
            registryKey: "cube",
            props: { region: "video", faceCapacity: 1 },
            focus: { region: "video", intensity: 0.7 },
          },
          mainContent: {
            registryKey: "cube",
            props: { region: "mainContent", faceCapacity: 1 },
          },
          sidebarTop: {
            registryKey: "cube",
            props: { region: "mainContent", faceCapacity: 1 },
          },
          sidebarBottom: {
            registryKey: "cube",
            props: { region: "mainContent", faceCapacity: 1 },
          },
          footerLeft: {
            registryKey: "cube",
            props: { region: "mainContent", faceCapacity: 1 },
          },
          footerRight: {
            registryKey: "cube",
            props: { region: "mainContent", faceCapacity: 1 },
          },
        },
      },
    ],
  },

  // Parent with children, focus inheritance
  nestedComponents: {
    scene_name: "nestedComponents",
    duration: 45_000,
    start_time: 0,
    ui: [
      {
        panels: {
          title: { registryKey: "staticTitle" },
          video: {
            registryKey: "hangul",
            focus: { region: "video", intensity: 0.9 },
            children: [
              {
                registryKey: "overlayBadge",
                props: { text: "LIVE" },
                duration: 5000,
              },
              {
                registryKey: "progressBar",
                props: { percentage: 75 },
                duration: 10000,
              },
              { registryKey: "controlsOverlay", duration: 15000 },
            ],
          },
          mainContent: {
            registryKey: "brickChart",
            children: [
              {
                registryKey: "tooltipHelper",
                props: { hint: "Click to interact" },
                duration: 8000,
              },
            ],
          },
          sidebarTop: {
            registryKey: "scheduleElements",
            children: [
              {
                registryKey: "notificationBadge",
                props: { count: 3 },
                duration: 12000,
              },
            ],
          },
          sidebarBottom: { registryKey: "topRightContent" },
          footerLeft: { registryKey: "footerLeft" },
          footerRight: { registryKey: "footerRight" },
        },
      },
    ],
  },

  // Multiple focus regions, complex hierarchy
  multiFocus: {
    scene_name: "multiFocus",
    duration: 20_000,
    start_time: 0,
    ui: [
      {
        panels: {
          title: {
            registryKey: "staticTitle",
            focus: { region: "title", intensity: 0.3 },
          },
          video: {
            registryKey: "leetype",
            props: { placeholder: "Type here...", autoFocus: true },
            focus: { region: "video", intensity: 0.8 },
            children: [
              { registryKey: "inputHelper", duration: 6000 },
              {
                registryKey: "characterCount",
                props: { max: 100 },
                duration: 20000,
              },
            ],
          },
          mainContent: {
            registryKey: "cluesDown",
            focus: { region: "mainContent", intensity: 0.5 },
            children: [{ registryKey: "highlighter", duration: 15000 }],
          },
          sidebarTop: { registryKey: "scheduleElements" },
          sidebarBottom: { registryKey: "topRightContent" },
          footerLeft: {
            registryKey: "footerLeft",
            children: [
              {
                registryKey: "statusIndicator",
                props: { status: "active" },
                duration: 20000,
              },
            ],
          },
          footerRight: { registryKey: "footerRight" },
        },
      },
    ],
  },

  // No focus, children only
  childrenOnly: {
    scene_name: "childrenOnly",
    duration: 15_000,
    start_time: 0,
    ui: [
      {
        panels: {
          title: { registryKey: "staticTitle" },
          video: {
            registryKey: "hangul",
            children: [
              {
                registryKey: "watermark",
                props: { position: "bottomRight" },
                duration: 15000,
              },
              { registryKey: "timer", duration: 15000 },
            ],
          },
          mainContent: {
            registryKey: "brickChart",
            children: [{ registryKey: "gridOverlay", duration: 15000 }],
          },
          sidebarTop: { registryKey: "scheduleElements" },
          sidebarBottom: { registryKey: "topRightContent" },
          footerLeft: { registryKey: "footerLeft" },
          footerRight: { registryKey: "footerRight" },
        },
      },
    ],
  },
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

- 🎯 **Panel = Parent + Focus**: Each panel has one parent component (registryKey) and optional focus
- 🌲 **Hierarchical Children**: Parents can contain multiple children with individual durations
- ⏱️ **Time-Scoped Components**: Children have \`duration\` fields controlling their lifecycle
- 🔒 **Focus Inheritance**: Focus applies to the entire panel (parent + all children)

## Architecture

\`\`\`
Panel {
  registryKey: "parentComponent",  // The parent/base component
  focus: { region, intensity },     // Optional focus for entire panel
  children: [                       // Optional nested components
    { registryKey, props, duration },
    { registryKey, props, duration }
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

function useAnimatedOrchestrator(
  sceneName: string,
  duration: number
): OrchestratorState {
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      setCurrentTime(elapsed % duration)
    }, 100)
    return () => clearInterval(interval)
  }, [duration])

  const sceneConfig = mockSceneRegistry[sceneName]

  return {
    is_running: true,
    is_paused: false,
    current_time: currentTime,
    total_duration: duration,
    progress: currentTime / duration,
    time_remaining: duration - currentTime,
    active_lifetimes: [
      {
        id: 1,
        kind: {
          type: "Scene",
          scene_id: sceneName,
          scene_name: sceneName,
          duration: duration,
          ui: sceneConfig.ui[0],
        },
        started_at: 0,
      },
    ],
    current_active_scene: sceneName,
    stream_status: {
      is_streaming: false,
      stream_time: 0,
      timecode: "00:00:00.000",
    },
  }
}

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
  const sceneConfig = mockSceneRegistry[scene]
  const orchestratorState = useAnimatedOrchestrator(scene, sceneConfig.duration)

  return (
    <div className="w-full h-screen">
      <OrchestratedYouTubeViewport
        orchestratorState={orchestratorState}
        sceneRegistry={mockSceneRegistry}
        componentRegistry={componentRegistry}
        transitionMs={transitionMs}
      />
      <div className="fixed bottom-4 left-4 bg-black/80 text-white px-3 py-2 rounded text-xs font-mono">
        <div>
          {scene}: {Math.floor(orchestratorState.current_time / 1000)}s /{" "}
          {Math.floor(orchestratorState.total_duration / 1000)}s
        </div>
      </div>
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
