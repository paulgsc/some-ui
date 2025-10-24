import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import {
  OrchestratedMainContent,
  useOrchestratedContent,
  type OrchestratedMainContentProps,
} from "."

type Story = StoryObj<typeof OrchestratedMainContent>
type Meta = MetaObj<typeof OrchestratedMainContent>

// Wrapper component for stories that need debug UI
const OrchestratedContentWithDebugUI = (
  props: OrchestratedMainContentProps
) => {
  const orchestrator = useOrchestratedContent(props)

  return (
    <div className="inset-0 absolute">
      {/* Debug info */}
      <div className="fixed right-4 top-4 z-50 rounded bg-black bg-opacity-75 p-2 text-xs text-white">
        <div>Scene: {orchestrator.currentActiveScene || "None"}</div>
        <div>Progress: {Math.round(orchestrator.sceneProgress * 100)}%</div>
        <div>Streaming: {orchestrator.obs.status.streaming ? "Yes" : "No"}</div>
        <div>Time: {orchestrator.obs.status.streamTimecode}</div>
      </div>

      {/* Main content area */}
      <div className="size-full">
        <OrchestratedMainContent {...props} />
      </div>

      {/* Controls */}
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        <button
          onClick={orchestrator.startStream}
          disabled={orchestrator.obs.status.streaming}
          className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Start Stream
        </button>
        <button
          onClick={orchestrator.stopStream}
          disabled={!orchestrator.obs.status.streaming}
          className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Stop Stream
        </button>
        <button
          onClick={orchestrator.skipCurrentScene}
          disabled={!orchestrator.currentActiveScene}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Skip Scene
        </button>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => <OrchestratedMainContent />,
}

export const WithDebugUI: Story = {
  render: (args) => <OrchestratedContentWithDebugUI {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          "Shows the component with debug information and controls for development.",
      },
    },
  },
}

export const CustomScenes: Story = {
  render: (args) => <OrchestratedContentWithDebugUI {...args} />,
  args: {
    contentScenes: [
      {
        key: "welcome",
        duration: 5000,
        factories: [
          () => <div className="p-8 text-center text-2xl">Welcome!</div>,
        ],
      },
      {
        key: "demo",
        duration: 10000,
        factories: [
          () => <div className="p-8 text-center">Demo Content A</div>,
          () => <div className="p-8 text-center">Demo Content B</div>,
        ],
      },
      {
        key: "goodbye",
        duration: 5000,
        factories: [
          () => <div className="p-8 text-center text-2xl">Goodbye!</div>,
        ],
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          "Example with custom content scenes and shorter durations for testing.",
      },
    },
  },
}

export const WithFallback: Story = {
  render: (args) => <OrchestratedContentWithDebugUI {...args} />,
  args: {
    fallbackContent: (
      <div className="flex h-64 items-center justify-center rounded bg-gray-100 text-gray-600">
        No active scene - fallback content
      </div>
    ),
    autoStart: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Shows custom fallback content when no scene is active.",
      },
    },
  },
}

export const WithCallbacks: Story = {
  render: (args) => <OrchestratedContentWithDebugUI {...args} />,
  args: {
    onSceneChange: (sceneKey: string, isActive: boolean) => {
      console.log(
        `Scene ${sceneKey} is now ${isActive ? "active" : "inactive"}`
      )
    },
    onStreamEnd: () => {
      console.log("Stream has ended")
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates callback functionality. Check the browser console for logs.",
      },
    },
  },
}

export const CleanRender: Story = {
  render: () => (
    <div className="h-64 border-2 border-dashed border-gray-300 p-4">
      <OrchestratedMainContent
        fallbackContent={
          <div className="flex h-full items-center justify-center text-gray-500">
            Clean component render with no extra UI
          </div>
        }
        autoStart={false}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Shows the clean component without any debug UI or controls.",
      },
    },
  },
}

export default {
  title: "UI/Content/OrchestratedMainContent",
  component: OrchestratedMainContent,
  parameters: {
    docs: {
      description: {
        component:
          "A component that orchestrates content scenes with OBS integration. The component only renders the active content - all debug UI is shown in stories for development purposes.",
      },
    },
  },
} as Meta
