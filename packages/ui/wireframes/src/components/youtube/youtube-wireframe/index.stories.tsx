import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import { YoutubeWireframe } from "@wireframes/components/youtube/youtube-wireframe"
import type { Chapter } from "some-ui-slideshow"

type Story = StoryObj<typeof YoutubeWireframe>
type Meta = MetaObj<typeof YoutubeWireframe>

export const chapters: Array<Chapter> = [
  {
    id: "1",
    title: "Introduction",
    startTime: 0,
    endTime: 330, // 5:30
    description: "Overview of what we'll build today",
    color: "bg-blue-500",
    subChapters: [],
  },
  {
    id: "2",
    title: "Project Setup",
    startTime: 330, // 5:30
    endTime: 920, // 15:20
    description: "Setting up the development environment",
    color: "bg-green-500",
    subChapters: [
      {
        id: "2-1",
        title: "Installing dependencies",
        startTime: 375, // 6:15
        endTime: 525, // 8:45
        description: "npm install commands",
        color: "bg-green-400",
      },
      {
        id: "2-2",
        title: "Configuration",
        startTime: 525, // 8:45
        endTime: 920, // 15:20
        description: "Setting up config files",
        color: "bg-green-600",
      },
    ],
  },
  {
    id: "3",
    title: "Building the UI",
    startTime: 920, // 15:20
    endTime: 2415, // 40:15
    description: "Creating the user interface components",
    color: "bg-purple-500",
    subChapters: [
      {
        id: "3-1",
        title: "Header component",
        startTime: 960, // 16:00
        endTime: 1530, // 25:30
        description: "Building the navigation",
        color: "bg-purple-400",
      },
      {
        id: "3-2",
        title: "Main content",
        startTime: 1530, // 25:30
        endTime: 2415, // 40:15
        description: "Creating the content area",
        color: "bg-purple-600",
      },
    ],
  },
  {
    id: "4",
    title: "Adding Functionality",
    startTime: 2415, // 40:15
    endTime: 4245, // 1:10:45
    description: "Implementing the core features",
    color: "bg-amber-500",
    subChapters: [
      {
        id: "4-1",
        title: "State management",
        startTime: 2460, // 41:00
        endTime: 3140, // 52:20
        description: "Using React hooks",
        color: "bg-amber-400",
      },
      {
        id: "4-2",
        title: "API integration",
        startTime: 3140, // 52:20
        endTime: 4245, // 1:10:45
        description: "Fetching data from backend",
        color: "bg-amber-600",
      },
    ],
  },
  {
    id: "5",
    title: "Testing & Deployment",
    startTime: 4245, // 1:10:45
    endTime: 5400, // 1:30:00 (assumed end)
    description: "Finalizing the project",
    color: "bg-red-500",
    subChapters: [],
  },
]

const totalDuration = 5400 // 1:30:00

export const Default: Story = {
  args: {
    chapters,
    totalDuration,
  },
}

export const WireframeScaled: Story = {
  args: {
    chapters,
    totalDuration,
    className: "scale-50",
  },
}
export default {
  title: "WireFrames/Youtube",
  component: YoutubeWireframe,
} as Meta
