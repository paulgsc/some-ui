import type { SceneConfig } from "some-types-utils"

import { assertNever } from "./error"
import type { SceneSelection } from "./scene-selector"

// --- Types ---

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

export type EditingState = Extract<EditorState, { type: "EditingExisting" }>
export type LibraryState = Extract<
  EditorState,
  { type: "SelectingFromLibrary" }
>

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
  draft: EditingState["draft"] | null
}

// --- State Constructors & Business Logic Helpers ---

function createEditingState(
  sceneIndex: number,
  scene: SceneConfig
): EditingState {
  return {
    type: "EditingExisting",
    sceneIndex,
    snapshot: scene,
    draft: {
      sceneName: scene.scene_name,
      durationSec: Math.floor(scene.duration / 1000),
      startTimeSec: Math.floor(scene.start_time / 1000),
      uiJson: JSON.stringify(scene.ui, null, 2),
      jsonError: null,
    },
  }
}

function updateDraft(
  state: EditingState,
  patch: Partial<EditingState["draft"]>
): EditingState {
  return {
    ...state,
    draft: {
      ...state.draft,
      ...patch,
    },
  }
}

function removeSelection(
  selections: Array<SceneSelection>,
  selectionId: string
): Array<SceneSelection> {
  const filtered = selections.filter((s) => s.id !== selectionId)
  const removed = selections.find((s) => s.id === selectionId)

  if (!removed) {
    return filtered
  }

  return filtered.map((sel) => {
    return sel.id === removed.id && sel.instanceIndex > removed.instanceIndex
      ? { ...sel, instanceIndex: sel.instanceIndex - 1 }
      : sel
  })
}

// --- Delegate Sub-Reducers ---

function reduceClosed(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "OPEN_FOR_EDIT": {
      return createEditingState(action.sceneIndex, action.scene)
    }

    case "OPEN_FOR_LIBRARY_ADD": {
      return { type: "SelectingFromLibrary", selections: [] }
    }

    default: {
      return assertNever(action.type)
    }
  }
}

function reduceEditing(state: EditingState, action: EditorAction): EditorState {
  switch (action.type) {
    case "UPDATE_DRAFT_NAME": {
      return updateDraft(state, { sceneName: action.value })
    }

    case "UPDATE_DRAFT_DURATION": {
      return updateDraft(state, { durationSec: action.value })
    }

    case "UPDATE_DRAFT_START_TIME": {
      return updateDraft(state, { startTimeSec: action.value })
    }

    case "UPDATE_DRAFT_JSON": {
      return updateDraft(state, { uiJson: action.value, jsonError: null })
    }

    case "SET_JSON_ERROR": {
      return updateDraft(state, { jsonError: action.error })
    }

    case "REPLACE_DRAFT_UI_FROM_LIBRARY": {
      return updateDraft(state, {
        uiJson: JSON.stringify(action.ui, null, 2),
        jsonError: null,
      })
    }

    case "CLOSE": {
      return { type: "Closed" }
    }

    case "OPEN_FOR_EDIT":
    case "OPEN_FOR_LIBRARY_ADD":
    case "ADD_LIBRARY_SELECTION":
    case "REMOVE_LIBRARY_SELECTION":
    case "SET_LIBRARY_SELECTIONS":
    case "CLEAR_LIBRARY_SELECTIONS": {
      return state
    }

    default: {
      return assertNever(action.type)
    }
  }
}

function reduceLibrary(state: LibraryState, action: EditorAction): EditorState {
  switch (action.type) {
    case "ADD_LIBRARY_SELECTION": {
      return {
        ...state,
        selections: [...state.selections, action.selection],
      }
    }

    case "REMOVE_LIBRARY_SELECTION": {
      return {
        ...state,
        selections: removeSelection(state.selections, action.selectionId),
      }
    }

    case "SET_LIBRARY_SELECTIONS": {
      return { ...state, selections: action.selections }
    }

    case "CLEAR_LIBRARY_SELECTIONS": {
      return { ...state, selections: [] }
    }

    case "CLOSE": {
      return { type: "Closed" }
    }

    case "OPEN_FOR_EDIT":
    case "OPEN_FOR_LIBRARY_ADD":
    case "UPDATE_DRAFT_JSON":
    case "UPDATE_DRAFT_NAME":
    case "UPDATE_DRAFT_DURATION":
    case "UPDATE_DRAFT_START_TIME":
    case "SET_JSON_ERROR":
    case "REPLACE_DRAFT_UI_FROM_LIBRARY": {
      return state
    }

    default: {
      return assertNever(action.type)
    }
  }
}

// --- Main Exports ---

export const editorReducer = (
  state: EditorState,
  action: EditorAction
): EditorState => {
  switch (state.type) {
    case "Closed": {
      return reduceClosed(state, action)
    }

    case "EditingExisting": {
      return reduceEditing(state, action)
    }

    case "SelectingFromLibrary": {
      return reduceLibrary(state, action)
    }

    default: {
      return assertNever(state.type)
    }
  }
}

export function buildSceneFromDraft(
  state: EditingState
): SceneConfig | { error: string } {
  try {
    const parsedUi: unknown = JSON.parse(state.draft.uiJson)
    if (!Array.isArray(parsedUi)) {
      return { error: "UI Intents must be an array" }
    }

    // Typed assignment checks out without any explicit type assertions
    const ui: SceneConfig["ui"] = parsedUi

    return {
      ...state.snapshot,
      scene_name: state.draft.sceneName,
      duration: state.draft.durationSec * 1000,
      start_time: (state.draft.startTimeSec ?? 0) * 1000,
      ui,
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
