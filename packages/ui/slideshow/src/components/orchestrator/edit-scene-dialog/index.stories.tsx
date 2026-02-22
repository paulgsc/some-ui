import { useReducer } from "react"
import type { EditorAction, EditorState } from "@slideshow/utils/scene-editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { SceneConfig } from "some-types-utils"

import { EditSceneDialog } from "."

// ---------------------------------------------
// Mocks for state and dispatch
// ---------------------------------------------

/**
 * Based on your Zod definition, it is an array of objects containing a 'panels' record.
 */
const mockScene: SceneConfig = {
  scene_name: "Demo Scene",
  duration: 60000,
  start_time: 0,
  ui: [
    {
      panels: {
        mainContent: {
          registry_key: "TextOverlay",
          props: { content: "Hello World" },
        },
      },
    },
  ],
}

const mockEditingState: EditorState = {
  type: "EditingExisting",
  sceneIndex: 0,
  snapshot: mockScene,
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
      id: "template-1",
      fileName: "TemplateA.json",
      instanceIndex: 0,
      sourceConfig: mockScene,
    },
  ],
}

// Minimal reducer that does nothing but satisfies the type
const reducer = (state: EditorState, _action: EditorAction): EditorState =>
  state

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
        onSaveEdit={() => {}}
      />
    )
  },
}

export const LibraryMode: Story = {
  render: () => {
    const [state, dispatch] = useReducer(reducer, mockLibraryState)

    return (
      <EditSceneDialog state={state} dispatch={dispatch} onBulkAdd={() => {}} />
    )
  },
}
