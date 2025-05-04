import { useCallback, useEffect, useRef, useState } from "react"
import { notificationEvents } from "@input/hooks/use-create-crossword-puzzle"
import type { Direction } from "@input/types/crossword"
import { cubeEvents } from "some-ui-slideshow"
import init, { ViewportManager } from "viewport-rotation"
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
  viewports: Array<ViewportOption>
  maxPerFace?: number
  activeCube?: Direction
  onError?: (error: Error) => void
}

// Cache WASM initialization to prevent multiple initializations

export const useViewportManager = ({
  viewports,
  maxPerFace = 2,
  activeCube,
  onError,
}: Options) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewportIds, setViewportIds] = useState<Array<string>>([])
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null)

  // Use a ref for the manager to ensure it persists across renders
  const managerRef = useRef<ViewportManager | null>(null)

  // Keep track of viewport states for each direction
  const [viewportStates, setViewportStates] = useState<
    Record<string, ViewportResponse["state"]>
  >({})

  // Keep track of initialization

  const lastHandledEventId = useRef<string | null>(null)

  // Initialize the WASM module and create viewports
  const initialize = useCallback(async () => {
    if (viewports.length === 0) return
    if (managerRef.current) return

    try {
      await init()

      managerRef.current = new ViewportManager()

      // Create a viewport for each direction
      const statesMap: Record<string, ViewportResponse["state"]> = {}

      for (const v of viewports) {
        if (v.totalItems <= 0) {
          managerRef.current = null
          return
        }
        console.log(
          `Creating viewport for ${v.viewId} with ${v.totalItems} items, ${maxPerFace} per face`
        )

        const response = managerRef.current.create_viewport(
          v.viewId,
          v.totalItems,
          maxPerFace
        )
        const parsedResponse = ViewportStateSchema.parse(response)

        statesMap[v.viewId] = parsedResponse.state
        console.log(
          `Successfully initialized viewport for id: ${parsedResponse.viewportId}`
        )
      }

      // Get the list of all viewports
      const listResponse = managerRef.current.list_viewports()
      const parsedList = ViewportListSchema.parse(listResponse)

      setViewportIds(parsedList.viewportIds)
      setActiveViewportId(parsedList.activeViewportId)
      setViewportStates(statesMap)
    } catch (err) {
      console.error("Error initializing viewport manager:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      managerRef.current = null

      if (onError && err instanceof Error) onError(err)
    } finally {
      setIsLoading(false)
    }
  }, [viewports, maxPerFace, onError])

  // Set active viewport
  const setActiveViewport = useCallback(
    (direction: Direction) => {
      try {
        const manager = managerRef.current
        if (!manager) return

        console.log(`Setting active viewport to ${direction}`)
        const response = manager.set_active_viewport(direction)
        const parsedResponse = ViewportStateSchema.parse(response)

        setActiveViewportId(parsedResponse.viewportId)

        // Update the state for this direction
        setViewportStates((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
      } catch (err) {
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
      } catch (err) {
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

        console.log(`${direction}: Rotating next`)
        const response = manager.rotate_viewport_next(direction)
        const parsedResponse = ViewportStateSchema.parse(response)

        // Update state for this direction
        setViewportStates((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
      } catch (err) {
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
        if (!currentState) return

        const { currFace, currIdx, faceIndices } = currentState

        console.log(`${direction}: Current i=${currIdx}, f=${currFace}`)

        if (faceIndices[currFace].length <= currIdx + 1) {
          console.log(`${direction}: End of face reached, rotating`)
          cubeEvents.emit("rotate:next", { id: 1 })
          rotateViewport(direction)
          return
        }

        console.log(`${direction}: Moving to next item`)
        const response = manager.viewport_next_item(direction)
        const parsedResponse = ViewportStateSchema.parse(response)

        // Update state for this direction
        setViewportStates((prev) => ({
          ...prev,
          [direction]: parsedResponse.state,
        }))
      } catch (err) {
        console.error(`Error getting ${direction} next item:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
      }
    },
    [activeCube, onError, rotateViewport, viewportStates]
  )

  // Get current item index for a specific viewport
  const getCurrentViewportItem = useCallback(
    (direction: Direction) => {
      try {
        const manager = managerRef.current
        if (!manager) return null

        return manager.get_viewport_current_item_index(direction)
      } catch (err) {
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

    const unsubNextAcrossCell = notificationEvents.on(
      "reveal:cell:across",
      () => {
        const eventId = `across_${Date.now()}_${Math.random()}`

        if (lastHandledEventId.current === eventId) {
          return
        }

        console.log("Handling across cell reveal")
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

      console.log("Handling down cell reveal")
      lastHandledEventId.current = eventId
      getNextViewportItem("down")
    })
    unsubscribers.push(unsubNextDownCell)

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [getNextViewportItem, activeCube])

  // Initialize when totalItems is available
  useEffect(() => {
    initialize()
  }, [initialize, viewports, maxPerFace, activeCube])

  return {
    isLoading,
    error,
    viewportIds,
    activeViewportId,
    viewportStates,
    setActiveViewport,
    setRotationAxis,
    rotateViewport,
    getNextViewportItem,
    getCurrentViewportItem,
    getViewportFaceIndices,
  }
}
