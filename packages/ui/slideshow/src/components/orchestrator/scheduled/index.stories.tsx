import { useEffect, useState } from "react"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ScheduledElementsList } from "."

type Story = StoryObj<typeof ScheduledElementsList>
type Meta = MetaObj<typeof ScheduledElementsList>

const meta: Meta = {
  title: "UI/SlideShow/Orchestrator/ScheduledElementsList",
  component: ScheduledElementsList,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[400px] h-[600px]">
        <Story />
      </div>
    ),
  ],
}

export default meta

// Mock data generators
const createMockElement = (
  id: string,
  scene_name: string,
  start_time: number,
  duration: number,
  metadata?: {
    title?: string
    subtitle?: string
    description?: string
  }
) => ({
  id,
  scene_name,
  start_time,
  end_time: start_time + duration,
  duration,
  is_active: false,
  metadata,
})

export const Default: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Opening Scene", 0, 30),
      createMockElement("scene_2", "Main Content", 30, 120),
      createMockElement("scene_3", "Closing Scene", 150, 45),
    ],
    currentTime: 0,
  },
}

export const WithActiveElement: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Opening Scene", 0, 30),
      {
        ...createMockElement("scene_2", "Main Content", 30, 120),
        is_active: true,
      },
      createMockElement("scene_3", "Closing Scene", 150, 45),
    ],
    currentTime: 60,
  },
}

export const WithMetadata: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Opening Scene", 0, 30, {
        title: "Welcome to the Show",
        subtitle: "An introduction to today's topics",
        description:
          "We'll be covering the latest developments in technology and design.",
      }),
      {
        ...createMockElement("scene_2", "Main Content", 30, 120, {
          title: "Deep Dive: React Patterns",
          subtitle: "Advanced component composition",
          description:
            "Exploring composition patterns, render props, and custom hooks in modern React applications.",
        }),
        is_active: true,
      },
      createMockElement("scene_3", "Q&A Session", 150, 45, {
        title: "Audience Questions",
        subtitle: "Live Q&A",
        description: "Answer your questions about the topics we covered today.",
      }),
    ],
    currentTime: 60,
  },
}

export const CompletedElement: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Opening Scene", 0, 30),
      {
        ...createMockElement("scene_2", "Main Content", 30, 120),
        is_active: true,
      },
      createMockElement("scene_3", "Intermission", 150, 60),
      createMockElement("scene_4", "Closing Scene", 210, 45),
    ],
    currentTime: 60,
  },
}

export const ManyUpcomingElements: Story = {
  args: {
    elements: [
      {
        ...createMockElement("scene_1", "Opening Scene", 0, 30),
        is_active: true,
      },
      createMockElement("scene_2", "Introduction", 30, 45),
      createMockElement("scene_3", "Topic A", 75, 60),
      createMockElement("scene_4", "Topic B", 135, 60),
      createMockElement("scene_5", "Topic C", 195, 60),
      createMockElement("scene_6", "Discussion", 255, 90),
      createMockElement("scene_7", "Break", 345, 30),
      createMockElement("scene_8", "Q&A", 375, 60),
      createMockElement("scene_9", "Closing Remarks", 435, 30),
    ],
    currentTime: 15,
  },
}

export const EmptyList: Story = {
  args: {
    elements: [],
    currentTime: 0,
  },
}

export const AllCompleted: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Opening Scene", 0, 30),
      createMockElement("scene_2", "Main Content", 30, 120),
      createMockElement("scene_3", "Closing Scene", 150, 45),
    ],
    currentTime: 200,
  },
}

export const LiveProgress: Story = {
  render: () => {
    const [currentTime, setCurrentTime] = useState(0)

    useEffect(() => {
      const interval = setInterval(() => {
        setCurrentTime((prev) => (prev >= 195 ? 0 : prev + 1))
      }, 1000)

      return () => clearInterval(interval)
    }, [])

    const elements = [
      createMockElement("scene_1", "Opening Scene", 0, 30, {
        title: "Welcome",
        subtitle: "Getting started",
        description: "Introduction to today's stream",
      }),
      createMockElement("scene_2", "Main Content", 30, 120, {
        title: "The Main Event",
        subtitle: "Core presentation",
        description:
          "Detailed exploration of our topic with examples and demonstrations.",
      }),
      createMockElement("scene_3", "Closing Scene", 150, 45, {
        title: "Wrap Up",
        subtitle: "Final thoughts",
        description: "Summary and next steps",
      }),
    ]

    const activeElements = elements.map((el) => ({
      ...el,
      is_active: currentTime >= el.start_time && currentTime < el.end_time,
    }))

    return (
      <ScheduledElementsList
        elements={activeElements}
        currentTime={currentTime}
      />
    )
  },
}

export const WithLongDurations: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Pre-show", 0, 300),
      {
        ...createMockElement("scene_2", "Main Stream", 300, 7200),
        is_active: true,
      },
      createMockElement("scene_3", "Post-show", 7500, 600),
    ],
    currentTime: 3600,
  },
}

export const PartialMetadata: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Scene with Title Only", 0, 30, {
        title: "Just a Title",
      }),
      {
        ...createMockElement("scene_2", "Scene with All Fields", 30, 120, {
          title: "Complete Metadata",
          subtitle: "With subtitle",
          description: "And a description too",
        }),
        is_active: true,
      },
      createMockElement("scene_3", "Scene without Metadata", 150, 45),
    ],
    currentTime: 60,
  },
}

export const TransitionMoment: Story = {
  args: {
    elements: [
      createMockElement("scene_1", "Ending Scene", 0, 30),
      createMockElement("scene_2", "Starting Scene", 30, 120),
      createMockElement("scene_3", "Next Scene", 150, 45),
    ],
    currentTime: 29,
  },
}
