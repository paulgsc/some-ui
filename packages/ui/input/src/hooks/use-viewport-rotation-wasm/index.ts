import { useCallback, useEffect, useRef, useState } from "react"
import type { CrosswordClueState } from "@input/hooks/use-create-crossword-puzzle"
import {
  clueEvents,
  notificationEvents,
} from "@input/hooks/use-create-crossword-puzzle"
import type { Direction } from "@input/types/crossword"
import { cubeEvents } from "@some-ui/dice-card"
import init, { ViewportManager } from "@some-ui/viewport-rotation"
import { createWasmLoader } from "@some-ui/wasm-loader"
import { createEventBus } from "some-ui-utils"
import z from "zod"

const UsizeSchema = z.number().int().min(0)
const FaceSchema = z.array(z.number().int().min(0))
const RotationAxisSchema = z.enum(["X-axis", "Y-axis"])

type RotatationAxis = z.infer<typeof RotationAxisSchema>
type Unsubscribe = () => void

// Revised schema to match the new ViewportManager response format
const ViewportStateSchema = z.object({
  viewportId: z.string(),
  state: z.object({
    faceIndices: z.array(FaceSchema),
    currFace: UsizeSchema,
    currIdx: UsizeSchema,
    currRotationAxis: RotationAxisSchema,
    pendingCount: UsizeSchema,
    cyclePosition: UsizeSchema,
    queueIdx: UsizeSchema,
  }),
})

export type ViewportResponse = z.infer<typeof ViewportStateSchema>

const ViewportListSchema = z.object({
  viewportIds: z.array(z.string()),
  activeViewportId: z.string().nullable(),
})

type ViewportOption = {
  viewId: Direction
  totalItems: number
}
type Options = {
  maxPerFace?: number
  onError?: (error: Error) => void
}

type UseViewportManagerReturn = {
  isLoading: boolean
  error: string | null
  viewportIds: Array<string>
  activeViewportId: string | null
  viewportStates: Record<string, ViewportResponse["state"]>
  cluesQueue: CrosswordClueState
  setActiveViewport: (direction: Direction) => void
  setRotationAxis: (direction: Direction, axis: RotatationAxis) => void
  rotateViewport: (direction: Direction) => void
  getNextViewportItem: (direction: Direction) => void
  getCurrentViewportItem: (direction: Direction) => number | null
  getViewportFaceIndices: (
    direction: Direction,
    faceIndex: number
  ) => Array<number> | null
}

export const useViewportManager = ({
  maxPerFace = 2,
  onError,
}: Options): UseViewportManagerReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewportIds, setViewportIds] = useState<Array<string>>([])
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null)
  const [cluesQueue, setCluesQueue] = useState<CrosswordClueState>(() =>
    clueEvents.getState()
  )

  // Use a ref for the manager to ensure it persists across renders
  const managerRef = useRef<ViewportManager | null>(null)
  const hasInitialized = useRef(false)
  // Per-instance loader, mirroring managerRef's original once-per-mount
  // memoization (guarded below by `!managerRef.current`) rather than a
  // module-level singleton shared across hook instances.
  const wasmLoaderRef = useRef(createWasmLoader({ importModule: () => init() }))

  // Keep track of viewport states for each direction
  const [viewportStates, setViewportStates] = useState<
    Record<string, ViewportResponse["state"]>
  >({})

  const lastHandledEventId = useRef<string | null>(null)

  // Initialize the WASM module and create viewports
  const initialize = useCallback(async () => {
    setIsLoading(true)
    const { cluesAcross, cluesDown } = cluesQueue
    if (cluesAcross.length === 0 && cluesDown.length === 0) {
      setIsLoading(false)
      return
    }
    const viewports: Array<ViewportOption> = []
    viewports.push({
      viewId: "across",
      totalItems: cluesAcross.length,
    })
    viewports.push({
      viewId: "down",
      totalItems: cluesDown.length,
    })

    try {
      if (!managerRef.current) {
        await wasmLoaderRef.current.load()
        managerRef.current = new ViewportManager()
      } else {
        managerRef.current.reset()
      }

      // Create a viewport for each direction
      const statesMap: Record<string, ViewportResponse["state"]> = {}

      for (const v of viewports) {
        if (v.totalItems <= 0) continue
        const response = managerRef.current.create_viewport(
          v.viewId,
          v.totalItems,
          maxPerFace
        )
        const parsedResponse = ViewportStateSchema.parse(response)

        statesMap[v.viewId] = parsedResponse.state
      }

      if (Object.entries(statesMap).length === 0) {
        managerRef.current = null
        return
      }

      // Get the list of all viewports
      const listResponse = managerRef.current.list_viewports()
      const parsedList = ViewportListSchema.parse(listResponse)

      setViewportIds(parsedList.viewportIds)
      setActiveViewportId(parsedList.activeViewportId)
      setViewportStates(statesMap)
      viewportEvents.setState((prev) => ({ ...prev, statesMap }))

      hasInitialized.current = true
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error initializing viewport manager:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      managerRef.current = null

      if (onError && err instanceof Error) onError(err)
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluesQueue.cluesAcross, cluesQueue.cluesDown, maxPerFace, onError])

  // Set active viewport
  const setActiveViewport = useCallback(
    (direction: Direction) => {
      try {
        const manager = managerRef.current
        if (!manager) return

        const response = manager.set_active_viewport(direction)
        const parsedResponse = ViewportStateSchema.parse(response)

        setActiveViewportId(parsedResponse.viewportId)

        // Update the state for this direction
        setViewportStates((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
        viewportEvents.setState((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Error setting active viewport to ${direction}:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
      }
    },
    [onError]
  )

  // Set rotation axis for a specific viewport
  const setRotationAxis = useCallback(
    (direction: Direction, axis: RotatationAxis) => {
      try {
        const manager = managerRef.current
        if (!manager) return

        const validatedAxis = RotationAxisSchema.parse(axis)
        const response = manager.set_viewport_rotation_axis(
          direction,
          JSON.stringify(validatedAxis)
        )
        const parsedResponse = ViewportStateSchema.parse(response)

        // Update state for this direction
        setViewportStates((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
        viewportEvents.setState((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Error setting ${direction} rotation axis:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
      }
    },
    [onError]
  )

  // Rotate a specific viewport
  const rotateViewport = useCallback(
    (direction: Direction) => {
      try {
        const manager = managerRef.current
        if (!manager) return

        const response = manager.rotate_viewport_next(direction)
        const parsedResponse = ViewportStateSchema.parse(response)

        // Update state for this direction
        setViewportStates((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
        viewportEvents.setState((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Error rotating ${direction} to next:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
      }
    },
    [onError]
  )

  // Get next item for a specific viewport
  const getNextViewportItem = useCallback(
    (direction: Direction) => {
      try {
        const manager = managerRef.current
        if (!manager) return

        const currentState = viewportStates[direction]
        if (!currentState || Object.entries(currentState).length === 0) return

        const { currFace, currIdx, faceIndices, queueIdx } = currentState
        const { lastRevealedAcrossIndex, lastRevealedDownIndex } = cluesQueue

        const lastRevealedIndex =
          direction === "across"
            ? lastRevealedAcrossIndex
            : lastRevealedDownIndex
        if (lastRevealedIndex === queueIdx) return

        const l = faceIndices[currFace]
        if (!l) return
        if (l.length <= currIdx + 1) {
          cubeEvents.emit("rotate:next", { id: 1 })
          rotateViewport(direction)
          return
        }

        const response = manager.viewport_next_item(direction)
        const parsedResponse = ViewportStateSchema.parse(response)

        // Update state for this direction
        setViewportStates((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
        viewportEvents.setState((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Error getting ${direction} next item:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      onError,
      rotateViewport,
      viewportStates,
      cluesQueue.lastRevealedAcrossIndex,
      cluesQueue.lastRevealedDownIndex,
    ]
  )

  // Get current item index for a specific viewport
  const getCurrentViewportItem = useCallback(
    (direction: Direction) => {
      try {
        const manager = managerRef.current
        if (!manager) return null

        return manager.get_viewport_current_item_index(direction)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Error getting ${direction} current item:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
        return null
      }
    },
    [onError]
  )

  // Get face indices for a specific viewport and face
  const getViewportFaceIndices = useCallback(
    (direction: Direction, faceIndex: number) => {
      try {
        const manager = managerRef.current
        if (!manager) return null

        const indicesJson = manager.get_viewport_face_indices(
          direction,
          faceIndex
        )
        return FaceSchema.parse(indicesJson)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Error getting ${direction} face item IDs:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
        return null
      }
    },
    [onError]
  )

  // Set up event listeners for each direction
  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = []

    const unsubClueQueue = clueEvents.subscribe(
      (state) => state,
      (updatedState) => setCluesQueue(updatedState)
    )
    unsubscribers.push(unsubClueQueue)

    const unsubNextAcrossCell = notificationEvents.on(
      "reveal:cell:across",
      () => {
        const eventId = `across_${Date.now()}_${Math.random()}`

        if (lastHandledEventId.current === eventId) {
          return
        }

        lastHandledEventId.current = eventId
        getNextViewportItem("across")
      }
    )
    unsubscribers.push(unsubNextAcrossCell)

    const unsubNextDownCell = notificationEvents.on("reveal:cell:down", () => {
      const eventId = `down_${Date.now()}_${Math.random()}`

      if (lastHandledEventId.current === eventId) {
        return
      }

      lastHandledEventId.current = eventId
      getNextViewportItem("down")
    })
    unsubscribers.push(unsubNextDownCell)

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [getNextViewportItem])

  // Initialize when totalItems is available - execution deferred slightly to prevent synchonous loop lints
  useEffect(() => {
    let active = true
    const runInit = async (): Promise<void> => {
      if (active) {
        await initialize()
      }
    }
    void runInit()

    return (): void => {
      active = false
    }
  }, [initialize])

  return {
    isLoading,
    error,
    viewportIds,
    activeViewportId,
    viewportStates,
    cluesQueue,
    setActiveViewport,
    setRotationAxis,
    rotateViewport,
    getNextViewportItem,
    getCurrentViewportItem,
    getViewportFaceIndices,
  }
}

export type ViewportEventState = Record<string, ViewportResponse["state"]>
export const viewportEvents = createEventBus<ViewportEventState, {}>({})
