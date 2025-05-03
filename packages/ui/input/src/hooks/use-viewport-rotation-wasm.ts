import { useCallback, useEffect, useRef, useState } from "react"
import { notificationEvents } from "@input/hooks/use-create-crossword-puzzle"
import type { Direction } from "@input/types/crossword"
import { cubeEvents } from "some-ui-slideshow"
import init, { ViewportRotation } from "viewport-rotation"
import z from "zod"

const UsizeSchema = z.number().int().min(0)
const FaceSchema = z.array(z.number().int().min(0))
const RotationAxisSchema = z.enum(["X-axis", "Y-axis"])

type RotatationAxis = z.infer<typeof RotationAxisSchema>
type Unsubscribe = () => void

const ViewportStateSchema = z.object({
  id: z.string(),
  faceIndices: z.array(FaceSchema),
  currFace: UsizeSchema,
  currIdx: UsizeSchema,
  currRotationAxis: RotationAxisSchema,
  pendingCount: UsizeSchema,
  cyclePosition: UsizeSchema,
})

type ViewportState = z.infer<typeof ViewportStateSchema>

type Options = {
  totalItems: number
  cluesDirection: Direction
  stateDirection: Direction
  maxPerFace?: number
  onError?: (error: Error) => void
}

// Cache WASM initialization to prevent multiple initializations
let wasmInitialized = false

export const useFetchViewportWasm = ({
  totalItems,
  cluesDirection,
  stateDirection,
  maxPerFace = 2,
  onError,
}: Options) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Use separate refs for managers and states to prevent interference
  const rotationManagerRef = useRef<ViewportRotation | null>(null)
  const [viewportState, setViewportState] = useState<ViewportState | null>(null)

  // Create a stable direction reference that won't change
  const directionRef = useRef(cluesDirection)

  // Keep track of initialization
  const hasInitialized = useRef(false)

  const lastHandledEventId = useRef<string | null>(null)

  const initialize = useCallback(async () => {
    if (hasInitialized.current) return

    try {
      // Initialize WASM module only once
      if (!wasmInitialized) {
        await init()
        wasmInitialized = true
      }

      console.log(
        `Initializing ${cluesDirection} rotation manager with ${totalItems} items, ${maxPerFace} per face`
      )

      // Create a new instance specifically for this direction
      const manager = new ViewportRotation(totalItems, maxPerFace)
      rotationManagerRef.current = manager

      // Get and store the initial state
      const initialState = manager.get_state()
      const parsedState = ViewportStateSchema.parse(initialState)
      setViewportState(parsedState)

      hasInitialized.current = true
      console.log(
        `Successfully initialized state for wasm id: ${initialState.id}`
      )
    } catch (err) {
      console.error(
        `Error initializing ${cluesDirection} viewport rotation:`,
        err
      )
      setError(err instanceof Error ? err.message : "Unknown error")
      rotationManagerRef.current = null
      setViewportState(null)

      if (onError && err instanceof Error) onError(err)
    } finally {
      setIsLoading(false)
    }
  }, [totalItems, maxPerFace, onError])

  const setRotationAxis = useCallback(
    (axis: RotatationAxis) => {
      try {
        const manager = rotationManagerRef.current
        if (!manager) return

        const validatedAxis = RotationAxisSchema.parse(axis)
        const stateJson = manager.set_rotation_axis(
          JSON.stringify(validatedAxis)
        )
        const parsedState = ViewportStateSchema.parse(stateJson)

        setViewportState(parsedState)
      } catch (err) {
        console.error(`Error setting ${cluesDirection} rotation axis:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
      }
    },
    [onError]
  )

  const rotateNext = useCallback(() => {
    try {
      const manager = rotationManagerRef.current
      if (!manager) return

      console.log(`${cluesDirection}: Rotating next`)
      const stateJson = manager.rotate_next()
      const parsedState = ViewportStateSchema.parse(stateJson)

      setViewportState(parsedState)
    } catch (err) {
      console.error(`Error rotating ${cluesDirection} to next:`, err)
      setError(err instanceof Error ? err.message : "Unknown error")
      if (onError && err instanceof Error) onError(err)
    }
  }, [onError])

  const getNextItem = useCallback(() => {
    try {
      const manager = rotationManagerRef.current
      if (!manager) return

      const prevJson = manager.get_state()
      const { currFace, currIdx, faceIndices, id } =
        ViewportStateSchema.parse(prevJson)

      console.log(`${cluesDirection}: Current i=${currIdx}, f=${currFace}`)
      console.log(`Getting next for wasm Id: ${id}`)

      if (faceIndices[currFace].length <= currIdx + 1) {
        console.log(`${cluesDirection}: End of face reached, rotating`)
        cubeEvents.emit("rotate:next", { direction: cluesDirection })
        rotateNext()
        return
      }

      console.log(`${cluesDirection}: Moving to next item`)
      const stateJson = manager.next_item()
      const parsedState = ViewportStateSchema.parse(stateJson)

      setViewportState(parsedState)
    } catch (err) {
      console.error(`Error getting ${cluesDirection} next item:`, err)
      setError(err instanceof Error ? err.message : "Unknown error")
      if (onError && err instanceof Error) onError(err)
    }
  }, [onError, rotateNext])

  const getCurrentItem = useCallback(() => {
    const manager = rotationManagerRef.current
    if (!manager) return null

    return manager.get_current_item_index()
  }, [])

  const getFaceItemIds = useCallback(
    (idx: number) => {
      try {
        const manager = rotationManagerRef.current
        if (!manager) return null

        const stateJson = manager.get_face_indices(idx)
        return FaceSchema.parse(stateJson)
      } catch (err) {
        console.error(`Error getting ${cluesDirection} face item IDs:`, err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError && err instanceof Error) onError(err)
        return null
      }
    },
    [onError]
  )

  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = []

    if (cluesDirection === "across") {
      const unsubNextAcrossCell = notificationEvents.on(
        "reveal:cell:across",
        () => {
          const eventId = `across_${Date.now()}_${Math.random()}`

          if (lastHandledEventId.current === eventId) {
            return
          }

          console.log(`${cluesDirection}: Handling across cell reveal`)
          lastHandledEventId.current = eventId
          getNextItem()
        }
      )
      unsubscribers.push(unsubNextAcrossCell)
    }

    if (cluesDirection === "down") {
      const unsubNextDownCell = notificationEvents.on(
        "reveal:cell:down",
        () => {
          const eventId = `down_${Date.now()}_${Math.random()}`

          if (lastHandledEventId.current === eventId) {
            return
          }

          console.log(`${cluesDirection}: Handling down cell reveal`)
          lastHandledEventId.current = eventId
          getNextItem()
        }
      )
      unsubscribers.push(unsubNextDownCell)
    }

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [cluesDirection, getNextItem])

  useEffect(() => {
    if (totalItems > 0) {
      initialize()
    }

    return (): void => {
      rotationManagerRef.current = null
      hasInitialized.current = false
    }
  }, [totalItems, maxPerFace, initialize])

  return {
    isLoading,
    error,
    // Expose the state for this specific direction only
    rotationState: viewportState,
    setRotationAxis,
    rotateNext,
    getNextItem,
    getCurrentItem,
    getFaceItemIds,
  }
}
