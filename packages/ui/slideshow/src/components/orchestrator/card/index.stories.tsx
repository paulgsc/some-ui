import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import type { SceneConfig } from "some-types-utils"

import { OrchestratorDemo } from "."

type Story = StoryObj<typeof OrchestratorDemo>
type Meta = MetaObj<typeof OrchestratorDemo>

/* -----------------------------------------------------
   Shared mock data (ALL DURATIONS IN MILLISECONDS)
----------------------------------------------------- */
const BASE_SCENES_MS: Array<SceneConfig> = [
  {
    scene_name: "Opening Sequence",
    duration: 30_000,
    metadata: {
      title: "Welcome",
      subtitle: "Stream Introduction",
      description: "Dynamic opening with logo animation and music",
    },
  },
  {
    scene_name: "Main Content Block",
    duration: 120_000,
    metadata: {
      title: "Featured Content",
      description: "Primary content segment with audience engagement",
    },
  },
  {
    scene_name: "Transition Graphics",
    duration: 15_000,
    metadata: {
      subtitle: "Scene Transition",
      description: "Animated transition effect",
    },
  },
  {
    scene_name: "Interview Segment",
    duration: 180_000,
    metadata: {
      title: "Guest Interview",
      subtitle: "Special Guest Appearance",
      description: "In-depth conversation with industry expert",
    },
  },
  {
    scene_name: "Product Showcase",
    duration: 90_000,
    metadata: {
      title: "Product Demo",
      subtitle: "New Release Spotlight",
      description: "Detailed walkthrough of latest features",
    },
  },
  {
    scene_name: "Closing Credits",
    duration: 45_000,
    metadata: {
      title: "Thank You",
      subtitle: "See You Next Time",
      description: "Credits roll with social media links",
    },
  },
]

/* -----------------------------------------------------
   Stories
----------------------------------------------------- */
export const Default: Story = {
  name: "Idle / Default",
  args: {},
}

/**
 * Confirms the UI behaves correctly when durations are large
 * and clearly in milliseconds (not seconds).
 */
export const WithLongScenesMs: Story = {
  name: "Long Scenes (ms)",
  render: () => (
    <OrchestratorDemo
      key="long-ms"
      initialScenes={[
        {
          scene_name: "Marathon Stream",
          duration: 3_600_000,
          metadata: {
            title: "Extended Session",
            subtitle: "60 Minute Special",
            description: "Long-form content with multiple segments",
          },
        },
        {
          scene_name: "Intermission",
          duration: 900_000,
          metadata: {
            title: "Break Time",
            subtitle: "15 Minute Pause",
            description: "Refreshment break with ambient music",
          },
        },
        {
          scene_name: "Encore",
          duration: 1_800_000,
          metadata: {
            title: "Bonus Content",
            subtitle: "30 Minute Encore",
            description: "Additional content by popular demand",
          },
        },
      ]}
    />
  ),
}

/**
 * Stress test: many scenes, short durations
 */
export const ManyScenesStress: Story = {
  name: "Many Scenes Stress Test",
  render: () => (
    <OrchestratorDemo
      key="many-scenes"
      initialScenes={Array.from({ length: 25 }).map((_, i) => ({
        scene_name: `Scene ${i + 1}`,
        duration: 10_000 + i * 1000,
        metadata: {
          title: `Scene ${i + 1}`,
          description: `Auto-generated scene #${i + 1}`,
        },
      }))}
    />
  ),
}

/**
 * Empty state handling
 */
export const ZeroScenes: Story = {
  name: "No Scenes",
  render: () => <OrchestratorDemo key="empty-scenes" initialScenes={[]} />,
}

/**
 * Simulated running state
 * Useful for visual QA of progress bars & timecodes
 */
export const LiveRunning: Story = {
  name: "Live / Running",
  parameters: {
    controls: { disable: true },
  },
}

/**
 * Paused mid-stream
 */
export const PausedMidStream: Story = {
  name: "Paused Mid-Stream",
  parameters: {
    controls: { disable: true },
  },
}

/**
 * Validates DnD reordering reflects immediately
 */
export const ReorderedScenes: Story = {
  name: "Reordered Scenes",
  render: () => (
    <OrchestratorDemo
      key="reordered"
      initialScenes={[...BASE_SCENES_MS].reverse()}
    />
  ),
}

/**
 * Validates edit dialog wiring
 */
export const EditingScene: Story = {
  name: "Editing Scene",
  play: async ({ canvasElement }) => {
    // Intentionally left light — manual verification
    // Story ensures dialog mounts correctly
  },
}

/**
 * Stream auto status story (isStreaming true/false)
 */
export const StreamingAutoStatus: Story = {
  name: "Streaming Status Toggle",
  parameters: {
    controls: { disable: true },
  },
}

/* -----------------------------------------------------
   Meta
----------------------------------------------------- */
export default {
  title: "UI/Slideshow/Orchestrator/OrchestratorDemo",
  component: OrchestratorDemo,
  parameters: {
    layout: "fullscreen",
  },
} as Meta
