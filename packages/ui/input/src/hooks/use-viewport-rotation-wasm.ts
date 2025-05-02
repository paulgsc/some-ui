import { useCallback, useEffect, useRef, useState } from "react"
import { notificationEvents } from "@input/hooks/use-create-crossword-puzzle"
import { cubeEventBus } from "some-ui-slideshow"
import init, { ViewportRotation } from "viewport-rotation"
import z from "zod"

const UsizeSchema = z.number().int().min(0)
const FaceSchema = z.array(z.number().int().min(0))
const RotationAxisSchema = z.enum(["X-axis", "Y-axis"])

type RotatationAxis = z.infer<typeof RotationAxisSchema>
type Unsubscribe = () => void

const ViewportStateSchema = z.object({
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
  maxPerFace?: number
  onError?: (error: Error) => void
}

export const useFetchViewportWasm = ({
  totalItems,
  maxPerFace = 2,
  onError,
}: Options) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const rotationManagerRef = useRef<ViewportRotation | null>(null)
  const [rotationState, setRotationState] = useState<ViewportState | null>(null)

  const initialize = useCallback(async () => {
    try {
      if (rotationManagerRef.current) return
      await init()

      const res = new ViewportRotation(totalItems, maxPerFace)
      rotationManagerRef.current = res

      const initialState = res.get_state()
      const validatedState = ViewportStateSchema.parse(initialState)
      setRotationState(validatedState)
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setRotationState(null)
      rotationManagerRef.current = null
      if (onError) onError(error)
    } finally {
      setIsLoading(false)
    }
  }, [totalItems, maxPerFace])

  const setRotationAxis = useCallback(
    (axis: RotatationAxis) => {
      if (!rotationManagerRef.current) return

      try {
        const validatedAxis = RotationAxisSchema.parse(axis)
        const stateJson = rotationManagerRef.current.set_rotation_axis(
          JSON.stringify(validatedAxis)
        )
        const validatedState = ViewportStateSchema.parse(stateJson)
        setRotationState(validatedState)
      } catch (err) {
        console.error("Error generating crossword:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        setRotationState(null)
        if (onError) onError(error)
      }
    },
    [onError]
  )

  const rotateNext = useCallback(() => {
    if (!rotationManagerRef.current) return

    try {
      const stateJson = rotationManagerRef.current.rotate_next()
      const validatedState = ViewportStateSchema.parse(stateJson)
      setRotationState(validatedState)
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setRotationState(null)
      if (onError) onError(error)
    }
  }, [onError])

  const getNextItem = useCallback(() => {
    if (!rotationManagerRef.current) return

    try {
      const prevJson = rotationManagerRef.current.get_state()
      const { currFace, currIdx, faceIndices } =
        ViewportStateSchema.parse(prevJson)

      if (faceIndices[currFace].length <= currIdx + 1) {
        cubeEventBus.emit("rotate:next", undefined)
        rotateNext()
        return
      }

      const stateJson = rotationManagerRef.current.next_item()
      const validatedState = ViewportStateSchema.parse(stateJson)
      setRotationState(validatedState)
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setRotationState(null)
      if (onError) onError(error)
    }
  }, [onError])

  const getCurrentItem = useCallback(() => {
    console.log("this ran: nextItem")
    if (!rotationManagerRef.current) return

    return rotationManagerRef.current.get_current_item_index()
  }, [onError])

  const getFaceItemIds = useCallback(
    (idx: number) => {
      if (!rotationManagerRef.current) return null

      try {
        const stateJson = rotationManagerRef.current.get_face_indices(idx)
        return FaceSchema.parse(stateJson)
      } catch (err) {
        console.error("Error generating crossword:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError) onError(error)
        return null
      }
    },
    [onError]
  )

  useEffect(() => {
    initialize()

    return (): void => {
      rotationManagerRef.current = null
    }
  }, [])

  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = []

    const unsubNextAcrossCell = notificationEvents.on(
      "reveal:cell:across",
      () => {
        getNextItem()
      }
    )
    unsubscribers.push(unsubNextAcrossCell)

    const unsubNextDownCell = notificationEvents.on("reveal:cell:down", () => {
      getNextItem()
    })
    unsubscribers.push(unsubNextDownCell)

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [])

  return {
    isLoading,
    error,
    rotationState,
    setRotationAxis,
    rotateNext,
    getNextItem,
    getCurrentItem,
    getFaceItemIds,
  }
}
