import { useReducer } from "react"
import type { EditorAction, EditorState } from "@slideshow/utils/scene-editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { SceneConfig } from "some-types-utils"

import { EditSceneDialog } from "."

// ---------------------------------------------
// Mocks for state and dispatch
// ---------------------------------------------
const mockScene: SceneConfig = {
  scene_name: "Demo Scene",
  duration: 60,
  ui: [{ intent: "showText", content: "Hello World" }],
}

const mockEditingState: EditorState = {
  type: "EditingExisting",
  sceneIndex: 0,
  draft: {
    sceneName: "Demo Scene",
    startTimeSec: 0,
    durationSec: 60,
    uiJson: JSON.stringify(mockScene.ui, null, 2),
    jsonError: null,
  },
}

const mockLibraryState: EditorState = {
  type: "SelectingFromLibrary",
  selections: [
    {
      fileName: "TemplateA.json",
      sourceConfig: mockScene,
    },
    {
      fileName: "TemplateB.json",
      sourceConfig: mockScene,
    },
  ],
}

// Simple reducer to log actions
const reducer = (state: EditorState, action: EditorAction): EditorState => {
  console.log("Dispatched action:", action)
  return state
}

// ---------------------------------------------
// Storybook Meta
// ---------------------------------------------
const meta: Meta<typeof EditSceneDialog> = {
  title: "UI/Slideshow/Orchestrator/EditSceneDialog",
  component: EditSceneDialog,
  parameters: {
    layout: "fullscreen",
  },
}

export default meta
type Story = StoryObj<typeof EditSceneDialog>

// ---------------------------------------------
// Stories
// ---------------------------------------------
export const EditMode: Story = {
  render: () => {
    const [state, dispatch] = useReducer(reducer, mockEditingState)

    return (
      <EditSceneDialog
        state={state}
        dispatch={dispatch}
        onSaveEdit={(index, scene) =>
          console.log(`[Story] Saved scene #${index}:`, scene)
        }
      />
    )
  },
}

export const LibraryMode: Story = {
  render: () => {
    const [state, dispatch] = useReducer(reducer, mockLibraryState)

    return (
      <EditSceneDialog
        state={state}
        dispatch={dispatch}
        onBulkAdd={(scenes) =>
          console.log(
            `[Story] Added ${scenes.length} scenes from library`,
            scenes
          )
        }
      />
    )
  },
}
