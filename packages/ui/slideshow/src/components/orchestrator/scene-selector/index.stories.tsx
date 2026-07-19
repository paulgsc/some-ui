import type { JSX } from "react"
import { useReducer } from "react"
import type { SceneLibraryItem } from "@slideshow/hooks/use-scene-library"
import type { SceneSelection } from "@slideshow/utils/scene-selector"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SceneSelectorTab } from "."

// --------------------------------------------------
// Mock Data
// --------------------------------------------------
const mockLibraryItems: [SceneLibraryItem, SceneLibraryItem, SceneLibraryItem] =
  [
    {
      key: "constant",
      displayName: "Constant",
      config: {
        scene_name: "Constant",
        duration: 60_000,
        start_time: 0,
        ui: [
          {
            panels: {
              main: { registry_key: "TextOverlay", props: { content: "A" } },
            },
          },
        ],
      },
    },
    {
      key: "assessment",
      displayName: "Assessment",
      config: {
        scene_name: "Assessment",
        duration: 45_000,
        start_time: 0,
        ui: [
          {
            panels: {
              main: { registry_key: "TextOverlay", props: { content: "B" } },
            },
          },
        ],
      },
    },
    {
      key: "cdrama",
      displayName: "CDrama",
      config: {
        scene_name: "CDrama",
        duration: 30_000,
        start_time: 0,
        ui: [
          {
            panels: {
              main: { registry_key: "TextOverlay", props: { content: "C" } },
            },
          },
        ],
      },
    },
  ]

// --------------------------------------------------
// Helper reducer to handle selections
// --------------------------------------------------
type State = Array<SceneSelection>
type Action = { type: "set"; selections: Array<SceneSelection> }

const reducer = (_state: State, action: Action): State => action.selections

// --------------------------------------------------
// Storybook Meta
// --------------------------------------------------
const meta: Meta<typeof SceneSelectorTab> = {
  title: "UI/Slideshow/Orchestrator/SceneSelectorTab",
  component: SceneSelectorTab,
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof SceneSelectorTab>

// --------------------------------------------------
// Stories
// --------------------------------------------------

export const Empty: Story = {
  render: (): JSX.Element => {
    const [selections, dispatch] = useReducer(reducer, [])

    return (
      <div className="h-[500px] p-4">
        <SceneSelectorTab
          selections={selections}
          onSelectionsChange={(sels) =>
            dispatch({ type: "set", selections: sels })
          }
        />
      </div>
    )
  },
}

export const SomeSelections: Story = {
  render: (): JSX.Element => {
    const [firstItem, secondItem] = mockLibraryItems
    const [selections, dispatch] = useReducer(reducer, [
      {
        id: "cdrama",
        sceneKey: firstItem.key,
        instanceIndex: 0,
        sourceConfig: firstItem.config,
      },
      {
        id: "constant",
        sceneKey: secondItem.key,
        instanceIndex: 0,
        sourceConfig: secondItem.config,
      },
    ])

    return (
      <div className="h-[500px] p-4">
        <SceneSelectorTab
          selections={selections}
          onSelectionsChange={(sels) =>
            dispatch({ type: "set", selections: sels })
          }
        />
      </div>
    )
  },
}

export const MaxPerScene: Story = {
  render: (): JSX.Element => {
    const [firstItem] = mockLibraryItems
    const [selections, dispatch] = useReducer(reducer, [
      {
        id: "assessment",
        sceneKey: firstItem.key,
        instanceIndex: 0,
        sourceConfig: firstItem.config,
      },
      {
        id: "leetype",
        sceneKey: firstItem.key,
        instanceIndex: 1,
        sourceConfig: firstItem.config,
      },
    ])

    return (
      <div className="h-[500px] p-4">
        <SceneSelectorTab
          selections={selections}
          onSelectionsChange={(sels) =>
            dispatch({ type: "set", selections: sels })
          }
          maxPerScene={2}
        />
      </div>
    )
  },
}
