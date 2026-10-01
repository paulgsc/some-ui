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
