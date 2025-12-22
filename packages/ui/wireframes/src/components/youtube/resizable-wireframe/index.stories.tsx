import { useEffect, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { OrchestratorState, SceneConfig } from "some-types-utils"

import { OrchestratedYouTubeViewport } from "."
import { mockComponentRegistry } from "./mock-component-registry"

// ============================================================================
// Mock Scene Registry
// ============================================================================

const mockSceneRegistry: Record<string, SceneConfig> = {
  learning: {
    scene_name: "learning",
    duration: 30_000,
    start_time: 0,
    ui: [
      {
        content: {
          title: { registryKey: "staticTitle" },
          video: { registryKey: "hangul" },
          mainContent: { registryKey: "brickChart" },
          sidebarTop: { registryKey: "scheduleElements" },
          sidebarBottom: { registryKey: "topRightContent" },
          footerLeft: { registryKey: "footerLeft" },
          footerRight: { registryKey: "footerRight" },
        },
        focus: {
          region: "video",
          intensity: 0.6,
        },
      },
    ],
  },

  practice: {
    scene_name: "practice",
    duration: 45_000,
    start_time: 0,
    ui: [
      {
        content: {
          title: { registryKey: "staticTitle" },
          video: {
            registryKey: "leetype",
            props: {
              placeholder: "Type your answer...",
              autoFocus: true,
            },
          },
          mainContent: { registryKey: "cluesDown" },
          sidebarTop: { registryKey: "scheduleElements" },
          sidebarBottom: { registryKey: "topRightContent" },
          footerLeft: { registryKey: "footerLeft" },
          footerRight: { registryKey: "footerRight" },
        },
        focus: {
          region: "video",
          intensity: 0.9,
        },
      },
    ],
  },

  review: {
    scene_name: "review",
    duration: 20_000,
    start_time: 0,
    ui: [
      {
        content: {
          title: { registryKey: "staticTitle" },
          video: { registryKey: "hangul" },
          mainContent: { registryKey: "brickChart" },
          sidebarTop: { registryKey: "topRightContent" },
          sidebarBottom: { registryKey: "scheduleElements" },
          footerLeft: { registryKey: "footerLeft" },
          footerRight: { registryKey: "footerRight" },
        },
        focus: {
          region: "mainContent",
          intensity: 0.4,
        },
      },
    ],
  },

  idle: {
    scene_name: "idle",
    duration: 10_000,
    start_time: 0,
    ui: [
      {
        content: {
          title: { registryKey: "staticTitle" },
          video: { registryKey: "hangul" },
          mainContent: { registryKey: "brickChart" },
          sidebarTop: { registryKey: "scheduleElements" },
          sidebarBottom: { registryKey: "topRightContent" },
          footerLeft: { registryKey: "footerLeft" },
          footerRight: { registryKey: "footerRight" },
        },
        focus: null,
      },
    ],
  },
}

// ============================================================================
// Meta Configuration
// ============================================================================

const meta = {
  title: "Layout/OrchestratedYouTubeViewport",
  component: OrchestratedYouTubeViewport,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Orchestrated YouTube Viewport

A deterministic, time-indexed layout projection system that combines:
- **Static viewport tree** (client-owned)
- **Dynamic content mapping** (server-driven)
- **Focus proposals** (server + component-originated)
- **Resizable layout solving** (constraint-based)

## Key Features

- 🎯 **Server-Authoritative Focus**: Server focus (priority 10) overrides component focus (priority 1)
- 🔒 **Component Sandboxing**: Components can only request focus on their own region
- ⏱️ **Time-Indexed Intents**: Layout evolves deterministically through scene timelines
- 🎨 **Lazy-Loaded Components**: Registry-based component loading with error boundaries
- 🧪 **Fully Deterministic**: Same (time, scene) → same layout

## Architecture

\`\`\`
Server Intent (t) → Resolve UI Intent → Focus Accumulation → 
Resolve Focus → Project Constraints → Solve Layout → Render
\`\`\`

Click on any component to see component-originated focus in action!
        `,
      },
    },
  },
  argTypes: {
    transitionMs: {
      control: { type: "range", min: 0, max: 1000, step: 50 },
      description: "Animation transition duration in milliseconds",
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
  duration: number,
  isRunning: boolean = true
): OrchestratorState {
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    if (!isRunning) return

    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const time = elapsed % duration
      setCurrentTime(time)
    }, 100) // Update every 100ms

    return () => clearInterval(interval)
  }, [duration, isRunning])

  return {
    is_running: isRunning,
    is_paused: false,
    current_time: currentTime,
    total_duration: duration,
    progress: currentTime / duration,
    time_remaining: duration - currentTime,
    active_lifetimes: [],
    current_active_scene: sceneName,
    stream_status: {
      is_streaming: false,
      stream_time: 0,
      timecode: "00:00:00.000",
    },
  }
}

// ============================================================================
// Story Wrappers
// ============================================================================

const AnimatedStory = ({
  scene,
  transitionMs = 300,
}: {
  scene: string
  transitionMs?: number
}) => {
  const sceneConfig = mockSceneRegistry[scene]
  const orchestratorState = useAnimatedOrchestrator(
    scene,
    sceneConfig.duration,
    true
  )

  return (
    <div className="w-full h-screen">
      <OrchestratedYouTubeViewport
        orchestratorState={orchestratorState}
        sceneRegistry={mockSceneRegistry}
        componentRegistry={mockComponentRegistry}
        transitionMs={transitionMs}
      />

      {/* Debug overlay */}
      <div className="fixed bottom-4 left-4 bg-black/80 text-white px-4 py-2 rounded text-xs font-mono">
        <div>Scene: {scene}</div>
        <div>
          Time: {Math.floor(orchestratorState.current_time / 1000)}s /{" "}
          {Math.floor(orchestratorState.total_duration / 1000)}s
        </div>
        <div>Progress: {Math.floor(orchestratorState.progress * 100)}%</div>
      </div>
    </div>
  )
}

const StaticStory = ({
  scene,
  time = 0,
  transitionMs = 300,
}: {
  scene: string
  time?: number
  transitionMs?: number
}) => {
  const sceneConfig = mockSceneRegistry[scene]

  // Since ui is now an array of UILayoutIntent without 'at' field,
  // we'll just use the first one for static stories
  const uiIntent = sceneConfig.ui[0]

  const orchestratorState: OrchestratorState = {
    is_running: false,
    is_paused: false,
    current_time: time,
    total_duration: sceneConfig.duration,
    progress: time / sceneConfig.duration,
    time_remaining: sceneConfig.duration - time,
    active_lifetimes: [],
    current_active_scene: scene,
    stream_status: {
      is_streaming: false,
      stream_time: 0,
      timecode: "00:00:00.000",
    },
  }

  return (
    <div className="w-full h-screen">
      <OrchestratedYouTubeViewport
        orchestratorState={orchestratorState}
        sceneRegistry={mockSceneRegistry}
        componentRegistry={mockComponentRegistry}
        transitionMs={transitionMs}
      />
    </div>
  )
}

// ============================================================================
// Stories
// ============================================================================

export const LearningSceneAnimated: Story = {
  render: (args) => (
    <AnimatedStory scene="learning" transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Learning Scene** with animated progression (30 seconds loop)

- Focus on video region (hangul grid) at 60% intensity throughout

Note: Since the updated schema has \`ui\` as a simple array of UILayoutIntent (without time-indexed \`at\` field),
this scene now maintains consistent focus. For time-based transitions, the server would need to send new scene 
configurations or the ActiveLifetime would include time-indexed UI intents.

Click any component to trigger component-originated focus!
        `,
      },
    },
  },
}

export const PracticeSceneAnimated: Story = {
  render: (args) => (
    <AnimatedStory scene="practice" transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Practice Scene** with heavy focus on typing input (45 seconds)

- Focus on video region (typing input) at 90% intensity
- Demonstrates high-intensity focus effect
- Try clicking the input to see component focus interaction
        `,
      },
    },
  },
}

export const ReviewSceneAnimated: Story = {
  render: (args) => (
    <AnimatedStory scene="review" transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Review Scene** with gentle focus (20 seconds loop)

- Focus on mainContent (40% intensity) throughout

With the updated schema, focus remains consistent unless the server sends new ActiveLifetime data
with different UI intents. This demonstrates stable, gentle focus on the main content area.
        `,
      },
    },
  },
}

export const IdleScene: Story = {
  render: (args) => (
    <AnimatedStory scene="idle" transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Idle Scene** with no server focus

- No server-driven focus (focus = null)
- All components have equal emphasis
- Component-originated focus is still active (click any component!)
- Demonstrates the base layout without focus constraints
        `,
      },
    },
  },
}

export const LearningSceneStart: Story = {
  render: (args) => (
    <StaticStory scene="learning" time={0} transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "Learning scene (video focused at 60%)",
      },
    },
  },
}

export const LearningSceneMidpoint: Story = {
  render: (args) => (
    <StaticStory
      scene="learning"
      time={15_000}
      transitionMs={args.transitionMs}
    />
  ),
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Learning scene at t=15s (same UI intent - video focused at 60%)",
      },
    },
  },
}

export const ReviewScenePeakFocus: Story = {
  render: (args) => (
    <StaticStory
      scene="review"
      time={10_000}
      transitionMs={args.transitionMs}
    />
  ),
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "Review scene (mainContent at 40% focus intensity)",
      },
    },
  },
}

export const FastTransitions: Story = {
  render: (args) => (
    <AnimatedStory scene="learning" transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 100,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Learning scene with fast transitions (100ms) - snappy focus changes",
      },
    },
  },
}

export const SlowTransitions: Story = {
  render: (args) => (
    <AnimatedStory scene="learning" transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 800,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Learning scene with slow transitions (800ms) - smooth, cinematic focus changes",
      },
    },
  },
}

export const NoTransitions: Story = {
  render: (args) => (
    <AnimatedStory scene="learning" transitionMs={args.transitionMs} />
  ),
  args: {
    transitionMs: 0,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Learning scene with instant transitions (0ms) - immediate layout changes",
      },
    },
  },
}
