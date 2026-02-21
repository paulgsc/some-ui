import type { SceneConfig } from "some-types-utils"

import type { SceneSelection } from "./scene-selector"

export type EditorState =
  | { type: "Closed" }
  | {
      type: "EditingExisting"
      sceneIndex: number
      snapshot: SceneConfig
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
      selections: Array<SceneSelection>
    }

export type EditorAction =
  | { type: "OPEN_FOR_EDIT"; sceneIndex: number; scene: SceneConfig }
  | { type: "OPEN_FOR_LIBRARY_ADD" }
  | { type: "CLOSE" }
  | { type: "UPDATE_DRAFT_NAME"; value: string }
  | { type: "UPDATE_DRAFT_DURATION"; value: number }
  | { type: "UPDATE_DRAFT_START_TIME"; value: number | undefined }
  | { type: "UPDATE_DRAFT_JSON"; value: string }
  | { type: "SET_JSON_ERROR"; error: string | null }
  | {
      type: "REPLACE_DRAFT_UI_FROM_LIBRARY"
      ui: Array<unknown>
      templateName: string
    }
  | { type: "ADD_LIBRARY_SELECTION"; selection: SceneSelection }
  | { type: "REMOVE_LIBRARY_SELECTION"; selectionId: string }
  | { type: "SET_LIBRARY_SELECTIONS"; selections: Array<SceneSelection> }
  | { type: "CLEAR_LIBRARY_SELECTIONS" }

export type EditorView = {
  isOpen: boolean
  mode: "edit" | "library" | "none"
  canSave: boolean
  selections: Array<SceneSelection>
  draft: Extract<EditorState, { type: "EditingExisting" }>["draft"] | null
}

export const editorReducer = (
  state: EditorState,
  action: EditorAction
): EditorState => {
  switch (state.type) {
    case "Closed":
      if (action.type === "OPEN_FOR_EDIT") {
        return {
          type: "EditingExisting",
          sceneIndex: action.sceneIndex,
          snapshot: action.scene,
          draft: {
            sceneName: action.scene.scene_name,
            durationSec: Math.floor(action.scene.duration / 1000),
            startTimeSec: Math.floor(action.scene.start_time / 1000),
            uiJson: JSON.stringify(action.scene.ui, null, 2),
            jsonError: null,
          },
        }
      }
      if (action.type === "OPEN_FOR_LIBRARY_ADD") {
        return { type: "SelectingFromLibrary", selections: [] }
      }
      return state

    case "EditingExisting":
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
            draft: { ...state.draft, uiJson: action.value, jsonError: null },
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

    case "SelectingFromLibrary":
      switch (action.type) {
        case "ADD_LIBRARY_SELECTION":
          return {
            ...state,
            selections: [...state.selections, action.selection],
          }
        case "REMOVE_LIBRARY_SELECTION": {
          const filtered = state.selections.filter(
            (s) => s.id !== action.selectionId
          )
          const removed = state.selections.find(
            (s) => s.id === action.selectionId
          )
          if (!removed) return { ...state, selections: filtered }
          const renumbered = filtered.map((sel) =>
            sel.fileName === removed.fileName &&
            sel.instanceIndex > removed.instanceIndex
              ? { ...sel, instanceIndex: sel.instanceIndex - 1 }
              : sel
          )
          return { ...state, selections: renumbered }
        }
        case "SET_LIBRARY_SELECTIONS":
          return { ...state, selections: action.selections }
        case "CLEAR_LIBRARY_SELECTIONS":
          return { ...state, selections: [] }
        case "CLOSE":
          return { type: "Closed" }
        default:
          return state
      }

    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

export function buildSceneFromDraft(
  state: Extract<EditorState, { type: "EditingExisting" }>
): SceneConfig | { error: string } {
  try {
    const parsedUi = JSON.parse(state.draft.uiJson) as Array<unknown>
    if (!Array.isArray(parsedUi))
      return { error: "UI Intents must be an array" }

    return {
      ...state.snapshot,
      scene_name: state.draft.sceneName,
      duration: state.draft.durationSec * 1000,
      start_time: (state.draft.startTimeSec ?? 0) * 1000,
      ui: parsedUi as SceneConfig["ui"],
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Invalid JSON format" }
  }
}

export const getEditorView = (state: EditorState): EditorView => {
  return {
    isOpen: state.type !== "Closed",
    mode:
      state.type === "EditingExisting"
        ? "edit"
        : state.type === "SelectingFromLibrary"
          ? "library"
          : "none",
    canSave:
      (state.type === "EditingExisting" && !state.draft.jsonError) ||
      (state.type === "SelectingFromLibrary" && state.selections.length > 0),
    selections: state.type === "SelectingFromLibrary" ? state.selections : [],
    draft: state.type === "EditingExisting" ? state.draft : null,
  }
}
