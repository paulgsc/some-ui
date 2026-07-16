import type { Reducer } from "../ochestra/ochestrated-store"
import { createSpeechItem } from "./actions"
import type { SpeechAction } from "./actions"
import type { SpeechQueueState } from "./types"

export const speechReducer: Reducer<SpeechQueueState, SpeechAction> = (
  state,
  action
) => {
  switch (action.type) {
    case "SPEAK": {
      const { componentId, text, options, maxRetries } = action.payload
      const priority = action.priority ?? 0
      const newItem = createSpeechItem(
        componentId,
        text,
        options,
        maxRetries,
        priority
      )

      // Insert into queue in priority order
      const newItems = [...state.items]
      let idx = newItems.findIndex((i) => i.priority < newItem.priority)
      if (idx === -1) newItems.push(newItem)
      else newItems.splice(idx, 0, newItem)

      return { ...state, items: newItems }
    }

    case "CANCEL": {
      const { componentId, itemId } = action.payload

      if (state.currentItem) {
        const shouldCancelCurrent = itemId
          ? state.currentItem.id === itemId
          : state.currentItem.componentId === componentId

        if (shouldCancelCurrent) {
          state.currentItem.controller.abort()
        }
      }

      const filteredItems = state.items.filter((item) => {
        const shouldRemove = itemId
          ? item.id === itemId
          : item.componentId === componentId

        if (shouldRemove) {
          item.controller.abort()
        }
        return !shouldRemove
      })

      return {
        ...state,
        items: filteredItems,
      }
    }

    case "PAUSE":
      if (state.currentItem) {
        state.currentItem.controller.abort()
      }
      return {
        ...state,
        status: "paused",
      }

    case "RESUME":
      return {
        ...state,
        status:
          state.items.length > 0 || state.currentItem ? "speaking" : "idle",
        error: null,
      }

    case "CLEAR":
      state.items.forEach((item) => item.controller.abort())
      if (state.currentItem) {
        state.currentItem.controller.abort()
      }

      return {
        ...state,
        items: [],
        currentItem: null,
        status: "idle",
        error: null,
      }

    case "ITEM_STARTED": {
      const { item } = action.payload
      return {
        ...state,
        currentItem: item,
        items: state.items.filter((i) => i.id !== item.id),
        status: "speaking",
        error: null,
      }
    }

    case "ITEM_COMPLETED":
      return {
        ...state,
        currentItem: null,
        status: state.items.length > 0 ? "speaking" : "idle",
        totalProcessed: state.totalProcessed + 1,
      }

    case "ITEM_FAILED": {
      const { itemId, error, shouldRetry } = action.payload

      if (!shouldRetry) {
        return {
          ...state,
          currentItem: null,
          status: state.items.length > 0 ? "speaking" : "idle",
          totalFailed: state.totalFailed + 1,
          error,
        }
      }

      const item = state.currentItem?.id === itemId ? state.currentItem : null
      if (item && item.retryCount < item.maxRetries) {
        const retryItem = {
          ...item,
          retryCount: item.retryCount + 1,
          controller: new AbortController(),
        }

        return {
          ...state,
          currentItem: null,
          items: [retryItem, ...state.items],
          status: "speaking",
        }
      }

      return {
        ...state,
        currentItem: null,
        status: state.items.length > 0 ? "speaking" : "idle",
        totalFailed: state.totalFailed + 1,
        error,
      }
    }

    case "ITEM_CANCELLED":
      return {
        ...state,
        currentItem: null,
        status: state.items.length > 0 ? "speaking" : "idle",
      }

    default:
      return state
  }
}
