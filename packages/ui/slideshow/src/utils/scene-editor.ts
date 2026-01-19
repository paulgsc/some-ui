
import type { SceneConfig } from "some-types-utils"
import type { SceneSelection } from "./scene-selector"

/**
 * Finite State Machine for Scene Editor Dialog
 * 
 * STATES:
 * 1. Closed - Dialog not visible
 * 2. EditingExisting - Modifying an existing scene's properties/UI
 * 3. SelectingFromLibrary - Choosing scenes from library to add in bulk
 * 
 * INVARIANTS:
 * - Only ONE state active at a time
 * - State transitions are explicit and validated
 * - Each state owns its data independently (no shared useState pollution)
 */

export type EditorState =
  | { type: "Closed" }
  | {
      type: "EditingExisting"
      sceneIndex: number
      snapshot: SceneConfig // Immutable snapshot of original
      draft: {
        sceneName: string
        durationSec: number
        startTimeSec: number | undefined
        uiJson: string
        jsonError: string | null
      }
    }
  | {
      type: "SelectingFromLibrary"
      selections: SceneSelection[]
    }

/**
 * Actions that trigger state transitions
 */
export type EditorAction =
  | { type: "OPEN_FOR_EDIT"; sceneIndex: number; scene: SceneConfig }
  | { type: "OPEN_FOR_LIBRARY_ADD" }
  | { type: "CLOSE" }
  | { type: "UPDATE_DRAFT_NAME"; value: string }
  | { type: "UPDATE_DRAFT_DURATION"; value: number }
  | { type: "UPDATE_DRAFT_START_TIME"; value: number | undefined }
  | { type: "UPDATE_DRAFT_JSON"; value: string }
  | { type: "SET_JSON_ERROR"; error: string | null }
  | { type: "REPLACE_DRAFT_UI_FROM_LIBRARY"; ui: any[]; templateName: string }
  | { type: "ADD_LIBRARY_SELECTION"; selection: SceneSelection }
  | { type: "REMOVE_LIBRARY_SELECTION"; selectionId: string }
  | { type: "SET_LIBRARY_SELECTIONS"; selections: SceneSelection[] }
  | { type: "CLEAR_LIBRARY_SELECTIONS" }

/**
 * State reducer - enforces valid transitions
 */
export function editorReducer(
  state: EditorState,
  action: EditorAction
): EditorState {
  switch (state.type) {
    case "Closed": {
      switch (action.type) {
        case "OPEN_FOR_EDIT":
          return {
            type: "EditingExisting",
            sceneIndex: action.sceneIndex,
            snapshot: action.scene,
            draft: {
              sceneName: action.scene.scene_name,
              durationSec: Math.floor(action.scene.duration / 1000),
              startTimeSec:
                action.scene.start_time !== undefined
                  ? Math.floor(action.scene.start_time / 1000)
                  : undefined,
              uiJson: JSON.stringify(action.scene.ui || [], null, 2),
              jsonError: null,
            },
          }

        case "OPEN_FOR_LIBRARY_ADD":
          return {
            type: "SelectingFromLibrary",
            selections: [],
          }

        default:
          return state
      }
    }

    case "EditingExisting": {
      switch (action.type) {
        case "UPDATE_DRAFT_NAME":
          return {
            ...state,
            draft: { ...state.draft, sceneName: action.value },
          }

        case "UPDATE_DRAFT_DURATION":
          return {
            ...state,
            draft: { ...state.draft, durationSec: action.value },
          }

        case "UPDATE_DRAFT_START_TIME":
          return {
            ...state,
            draft: { ...state.draft, startTimeSec: action.value },
          }

        case "UPDATE_DRAFT_JSON":
          return {
            ...state,
            draft: {
              ...state.draft,
              uiJson: action.value,
              jsonError: null, // Clear error on edit
            },
          }

        case "SET_JSON_ERROR":
          return {
            ...state,
            draft: { ...state.draft, jsonError: action.error },
          }

        case "REPLACE_DRAFT_UI_FROM_LIBRARY":
          return {
            ...state,
            draft: {
              ...state.draft,
              uiJson: JSON.stringify(action.ui, null, 2),
              jsonError: null,
            },
          }

        case "CLOSE":
          return { type: "Closed" }

        default:
          return state
      }
    }

    case "SelectingFromLibrary": {
      switch (action.type) {
        case "ADD_LIBRARY_SELECTION":
          return {
            ...state,
            selections: [...state.selections, action.selection],
          }

        case "REMOVE_LIBRARY_SELECTION":
          const filtered = state.selections.filter(
            (s) => s.id !== action.selectionId
          )
          // Renumber instances
          const removed = state.selections.find(
            (s) => s.id === action.selectionId
          )
          if (!removed) return { ...state, selections: filtered }

          const renumbered = filtered.map((sel) => {
            if (
              sel.fileName === removed.fileName &&
              sel.instanceIndex > removed.instanceIndex
            ) {
              return { ...sel, instanceIndex: sel.instanceIndex - 1 }
            }
            return sel
          })

          return { ...state, selections: renumbered }

        case "SET_LIBRARY_SELECTIONS":
          return { ...state, selections: action.selections }

        case "CLEAR_LIBRARY_SELECTIONS":
          return { ...state, selections: [] }

        case "CLOSE":
          return { type: "Closed" }

        default:
          return state
      }
    }

    default: {
      // Exhaustiveness check
      const _exhaustive: never = state
      return state
    }
  }
}

/**
 * Derive computed values from state
 */
export function getEditorView(state: EditorState) {
  switch (state.type) {
    case "Closed":
      return {
        isOpen: false,
        mode: null,
        canSave: false,
      } as const

    case "EditingExisting":
      return {
        isOpen: true,
        mode: "edit" as const,
        canSave: state.draft.jsonError === null,
        sceneIndex: state.sceneIndex,
        draft: state.draft,
      }

    case "SelectingFromLibrary":
      return {
        isOpen: true,
        mode: "library" as const,
        canSave: state.selections.length > 0,
        selections: state.selections,
      }

    default: {
      const _exhaustive: never = state
      throw new Error("Invalid state")
    }
  }
}

/**
 * Build final SceneConfig from EditingExisting state
 */
export function buildSceneFromDraft(
  state: Extract<EditorState, { type: "EditingExisting" }>
): SceneConfig | { error: string } {
  try {
    const parsedUi = JSON.parse(state.draft.uiJson)
    if (!Array.isArray(parsedUi)) {
      return { error: "UI Intents must be an array" }
    }

    return {
      ...state.snapshot,
      scene_name: state.draft.sceneName,
      duration: state.draft.durationSec * 1000,
      start_time: (state.draft.startTimeSec ?? 0) * 1000,
      ui: parsedUi,
    }
  } catch (e: any) {
    return { error: e.message || "Invalid JSON format" }
  }
}
