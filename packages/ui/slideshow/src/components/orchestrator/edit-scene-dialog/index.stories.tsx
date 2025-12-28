import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { SceneConfig } from "some-types-utils"

import { EditSceneDialog } from "."

const meta: Meta<typeof EditSceneDialog> = {
  title: "Orchestrator/Dialogs/EditSceneDialog",
  component: EditSceneDialog,
  parameters: {
    layout: "centered",
  },
}
export default meta

type Story = StoryObj<typeof EditSceneDialog>

/* --------------------------------------------
 * Stateful Wrapper with Live JSON Output
 * ------------------------------------------ */

const StatefulWrapper = ({
  initialOpen = true,
  scene,
}: {
  initialOpen?: boolean
  scene: SceneConfig | null
}) => {
  const [open, setOpen] = useState(initialOpen)
  const [currentScene, setCurrentScene] = useState(scene)

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <div className="flex gap-4">
        <Button onClick={() => setOpen(true)}>Open Intent Editor</Button>
        <Button variant="outline" onClick={() => setCurrentScene(null)}>
          Reset to Null
        </Button>
      </div>

      {currentScene && (
        <div className="w-full p-4 rounded-lg bg-zinc-950 border border-zinc-800">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">
            Current Timeline Payload
          </p>
          <pre className="text-xs text-emerald-400 overflow-auto max-h-40 font-mono">
            {JSON.stringify(currentScene, null, 2)}
          </pre>
        </div>
      )}

      <EditSceneDialog
        open={open}
        scene={currentScene}
        onOpenChange={setOpen}
        onSave={(updated) => {
          console.log("Timeline Sync:", updated)
          setCurrentScene(updated)
        }}
      />
    </div>
  )
}

// Mock Button for the wrapper
const Button = ({ children, onClick, variant = "primary" }: any) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      variant === "primary"
        ? "bg-blue-600 text-white hover:bg-blue-700"
        : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
    }`}
  >
    {children}
  </button>
)

/* --------------------------------------------
 * Stories
 * ------------------------------------------ */

/**
 * Tests the high-density "Rich Intent" layout you specified.
 * Validates that multiple sidebar and footer keys are preserved.
 */
export const RichIntentLayout: Story = {
  render: () => (
    <StatefulWrapper
      scene={{
        scene_name: "Dashboard: Main View",
        duration: 30000,
        start_time: 0,
        ui: [
          {
            at: 0,
            intent: {
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
          } as any,
        ],
      }}
    />
  ),
}

/**
 * Tests a multi-step animation sequence within a single scene.
 * Useful for validating 'at' timestamps in the JSON array.
 */
export const SequentialIntents: Story = {
  render: () => (
    <StatefulWrapper
      scene={{
        scene_name: "Intro Sequence",
        duration: 10000,
        ui: [
          {
            at: 0,
            intent: { content: { main: { registryKey: "LogoFadeIn" } } },
          },
          {
            at: 2500,
            intent: { content: { main: { registryKey: "DashboardView" } } },
          },
        ] as any,
      }}
    />
  ),
}

/**
 * Tests how the dialog handles empty or null data safely.
 */
export const EmptyScene: Story = {
  render: () => (
    <StatefulWrapper
      scene={{
        scene_name: "New Scene",
        duration: 5000,
        ui: [],
      }}
    />
  ),
}

/**
 * Manual test for JSON syntax errors.
 * Paste invalid JSON in the 'Layout' tab to see the error badge.
 */
export const SyntaxErrorTest: Story = {
  render: () => <StatefulWrapper />,
}
