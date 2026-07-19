import type { JSX } from "react"
import { useReducer } from "react"
import type { SceneSelection } from "@slideshow/utils/scene-selector"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SceneSelectorTab } from "."

// --------------------------------------------------
// Mock Data
// --------------------------------------------------
const mockLibraryItems = [
  {
    fileName: "constant" as const,
    displayName: "Constant",
    config: {
      scene_name: "Constant",
      duration: 60,
      ui: [{ intent: "showText", content: "A" }],
    },
  },
  {
    fileName: "assessment" as const,
    displayName: "Assessment",
    config: {
      scene_name: "Assessment",
      duration: 45,
      ui: [{ intent: "showText", content: "B" }],
    },
  },
  {
    fileName: "cdrama" as const,
    displayName: "CDrama",
    config: {
      scene_name: "CDrama",
      duration: 30,
      ui: [{ intent: "showText", content: "C" }],
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
    const [el] = mockLibraryItems
    const fileName = el?.fileName ?? ""
    const [selections, dispatch] = useReducer(reducer, [
      {
        id: "cdrama",
        fileName,
        instanceIndex: 0,
        sourceConfig: mockLibraryItems[0]
          .config satisfies SceneSelection["sourceConfig"],
      },
      {
        id: "constant",
        fileName,
        instanceIndex: 0,
        sourceConfig: mockLibraryItems[1]
          .config satisfies SceneSelection["sourceConfig"],
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
    const [el] = mockLibraryItems
    const fileName = el?.fileName ?? ""
    const [selections, dispatch] = useReducer(reducer, [
      {
        id: "assessment",
        fileName,
        instanceIndex: 0,
        sourceConfig: mockLibraryItems[0]
          .config satisfies SceneSelection["sourceConfig"],
      },
      {
        id: "leetype",
        fileName,
        instanceIndex: 1,
        sourceConfig: mockLibraryItems[0]
          .config satisfies SceneSelection["sourceConfig"],
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
