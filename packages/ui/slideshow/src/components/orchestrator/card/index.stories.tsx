import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import type { SceneConfig, TimeMs } from "some-types-utils"

import { OrchestratorDemo } from "."

type Story = StoryObj<typeof OrchestratorDemo>
type Meta = MetaObj<typeof OrchestratorDemo>

/* -----------------------------------------------------
    Mock Factory: Handles mandatory start_time math
----------------------------------------------------- */
const createMockTimeline = (
  scenes: Array<Partial<SceneConfig>>
): Array<SceneConfig> => {
  let currentTime: TimeMs = 0
  return scenes.map((s) => {
    const scene: SceneConfig = {
      scene_name: s.scene_name ?? "Untitled Scene",
      duration: s.duration ?? 30_000,
      start_time: currentTime,
      ui: s.ui ?? [],
    }
    currentTime += scene.duration
    return scene
  })
}

/* -----------------------------------------------------
    Stories
----------------------------------------------------- */

/**
 * Empty State
 */
export const Empty: Story = {
  name: "State: No Scenes",
  args: {
    initialScenes: [],
  },
}

/**
 * Standard Production Workflow
 * Showcases a mix of simple scenes and scenes with UI overlays/props
 */
export const ProductionWorkflow: Story = {
  name: "Workflow: Live Production",
  args: {
    initialScenes: createMockTimeline([
      {
        scene_name: "Pre-stream Loop",
        duration: 60_000,
        ui: [
          {
            panels: {
              background: {
                registry_key: "MotionGraphics",
                props: { pattern: "dots", speed: "slow", color: "#3b82f6" },
              },
              overlay: {
                registry_key: "CountdownTimer",
                props: {
                  targetDate: "2025-12-31T23:59:59",
                  label: "Starting Soon",
                },
              },
            },
          },
        ],
      },
      {
        scene_name: "Host Intro",
        duration: 120_000,
        ui: [
          {
            panels: {
              main: {
                registry_key: "CameraFeed",
                props: { source: "Cam-01", filter: "none" },
              },
              lower_third: {
                registry_key: "SocialCard",
                props: {
                  name: "Alex Rivera",
                  handle: "@arivera_dev",
                  platform: "twitter",
                },
                focus: { region: "bottom-left", intensity: 0.8 },
              },
            },
          },
        ],
      },
      {
        scene_name: "Code Walkthrough",
        duration: 300_000,
        ui: [
          {
            panels: {
              main: {
                registry_key: "ScreenShare",
                props: { window: "VS Code", zoom: 1.2 },
                focus: { region: "center", intensity: 1.0 },
              },
              pip: {
                registry_key: "CameraFeed",
                props: { source: "Cam-01", size: "small" },
              },
            },
          },
        ],
      },
    ]),
  },
}

/**
 * Layout Intensity & Focus Intent
 * Specifically showcases how the 'focus' field changes the UI priority
 */
export const SpatialFocusTesting: Story = {
  name: "UI: Focus Intent Testing",
  args: {
    initialScenes: createMockTimeline([
      {
        scene_name: "High Intensity Left",
        duration: 30_000,
        ui: [
          {
            panels: {
              sidebar: {
                registry_key: "ChatStream",
                props: { theme: "glass" },
                focus: { region: "left", intensity: 0.95 },
              },
            },
          },
        ],
      },
      {
        scene_name: "Subtle Background Focus",
        duration: 30_000,
        ui: [
          {
            panels: {
              bg: {
                registry_key: "Ambience",
                props: { type: "ocean" },
                focus: { region: "center", intensity: 0.1 },
              },
            },
          },
        ],
      },
    ]),
  },
}

/**
 * Complex Multi-Intent Scene
 * A single scene containing multiple layout intents (multi-step UI)
 */
export const MultiIntentScene: Story = {
  name: "UI: Multiple Intents per Scene",
  args: {
    initialScenes: createMockTimeline([
      {
        scene_name: "Interview with Guest",
        duration: 180_000,
        ui: [
          {
            // First Layout Intent: Split Screen
            panels: {
              left: {
                registry_key: "CameraFeed",
                props: { source: "Cam-Host" },
              },
              right: {
                registry_key: "CameraFeed",
                props: { source: "Cam-Guest" },
              },
            },
          },
          {
            // Second Layout Intent: Add shared ticker
            panels: {
              footer: {
                registry_key: "NewsTicker",
                props: { items: ["Breaking news...", "Stock market up"] },
                focus: { region: "bottom", intensity: 0.6 },
              },
            },
          },
        ],
      },
    ]),
  },
}

/**
 * Reordered / Reverse Check
 */
export const ReverseTimeline: Story = {
  name: "Workflow: Reordered Timeline",
  args: {
    initialScenes: createMockTimeline([
      { scene_name: "The End", duration: 15_000 },
      { scene_name: "The Middle", duration: 45_000 },
      { scene_name: "The Beginning", duration: 30_000 },
    ]),
  },
}

/* -----------------------------------------------------
    Meta Configuration
----------------------------------------------------- */
const meta = {
  title: "UI/Slideshow/Orchestrator/OrchestratorDemo",
  component: OrchestratorDemo,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    initialScenes: { control: "object" },
  },
} satisfies Meta

export default meta
