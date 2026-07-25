import type { SceneConfig } from "@some-ui/types"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { OrchestratorTimeline } from "."

// Mock scenes based on your new SceneConfigSchema
const mockScenes: Array<SceneConfig> = [
  {
    scene_name: "Intro Sequence",
    duration: 5000,
    start_time: 0,
    ui: [],
  },
  {
    scene_name: "Guest Interview",
    duration: 15000,
    start_time: 5000,
    ui: [],
  },
  {
    // This scene overlaps with the "Guest Interview" to test the concurrency UI
    scene_name: "Lower Third Overlay",
    duration: 4000,
    start_time: 7000,
    ui: [],
  },
  {
    scene_name: "Outro",
    duration: 5000,
    start_time: 20000,
    ui: [],
  },
]

const meta: MetaObj<typeof OrchestratorTimeline> = {
  title: "UI/Slideshow/Orchestrator/Timeline",
  component: OrchestratorTimeline,
  tags: ["autodocs"],
  argTypes: {
    onEditScene: { action: "onEditScene" },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl mx-auto p-6 bg-background min-h-[400px]">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof OrchestratorTimeline>

/**
 * Standard View: Represents a healthy timeline with one concurrent overlap.
 * The ergonomic "Global Track" should show the spacing clearly.
 */
export const Default: Story = {
  args: {
    scenes: mockScenes,
  },
}

/**
 * Active Playback: Shows the timeline as if the stream is currently 8 seconds in.
 * Demonstrates past (muted), active (emerald), and future (primary) states.
 */
export const ActiveStream: Story = {
  args: {
    scenes: mockScenes,
  },
  parameters: {
    // Mocking the store state via your store's provider/initial state if using a decorator
    orchestratorInitialState: {
      current_time: 8000,
      total_duration: 25000,
      active_lifetimes: [
        {
          id: 1,
          kind: {
            type: "Scene",
            scene_id: "Guest Interview",
            scene_name: "Guest Interview",
            duration: 15000,
          },
          started_at: 5000,
        },
        {
          id: 2,
          kind: {
            type: "Scene",
            scene_id: "Lower Third Overlay",
            scene_name: "Lower Third Overlay",
            duration: 4000,
          },
          started_at: 7000,
        },
      ],
    },
  },
}

/**
 * High Density: Many short scenes starting at the same time.
 * Tests the ergonomic "Collision" icons and UI layer counting.
 */
export const ComplexConcurrency: Story = {
  args: {
    scenes: [
      {
        scene_name: "Background Loop",
        duration: 30000,
        start_time: 0,
        ui: [],
      },
      ...Array.from({ length: 5 }).map((_, i) => ({
        scene_name: `Popup Event ${i + 1}`,
        duration: 2000,
        start_time: i * 3000,
        ui: [],
      })),
    ],
  },
}

/**
 * Empty/New State: For when a user hasn't configured scenes yet.
 */
export const EmptyState: Story = {
  args: {
    scenes: [],
  },
}
