import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { SceneConfig } from "some-types-utils"

import { EditSceneDialog } from "."

const meta: Meta<typeof EditSceneDialog> = {
  title: "UI/SlideShow/Orchestrator/EditSceneDialog",
  component: EditSceneDialog,
}
export default meta

type Story = StoryObj<typeof EditSceneDialog>

const baseScene: SceneConfig = {
  scene_name: "Intro Scene",
  duration: 15,
  metadata: {
    title: "Opening",
    subtitle: "Fade In",
  },
}

const StatefulWrapper = ({
  initialOpen = true,
  scene = baseScene,
}: {
  initialOpen?: boolean
  scene: SceneConfig | null
}) => {
  const [open, setOpen] = useState(initialOpen)
  const [currentScene, setCurrentScene] = useState(scene)

  return (
    <EditSceneDialog
      open={open}
      scene={currentScene}
      onOpenChange={setOpen}
      onSave={(updated) => {
        console.log("Saved scene:", updated)
        setCurrentScene(updated)
      }}
    />
  )
}

/* --------------------------------------------
 * Stories
 * ------------------------------------------ */

export const Default: Story = {
  render: () => <StatefulWrapper />,
}

export const WithMetadata: Story = {
  render: () => (
    <StatefulWrapper
      scene={{
        scene_name: "Establishing Shot",
        duration: 45,
        metadata: {
          title: "Scene 1",
          description: "Wide city view with ambient sound",
        },
      }}
    />
  ),
}

export const VeryShortDuration: Story = {
  render: () => (
    <StatefulWrapper
      scene={{
        scene_name: "Quick Cut",
        duration: 1,
      }}
    />
  ),
}

export const InitiallyClosed: Story = {
  render: () => <StatefulWrapper initialOpen={false} />,
}

export const NoSceneSelected: Story = {
  render: () => (
    <EditSceneDialog
      open
      scene={null}
      onOpenChange={() => {}}
      onSave={() => {}}
    />
  ),
}
