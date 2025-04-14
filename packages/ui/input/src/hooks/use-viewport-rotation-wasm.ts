import { useCallback, useEffect, useRef, useState } from "react"
import init, { ViewportRotation } from "viewport-rotation"
import z from "zod"

const FaceSchema = z.array(z.string())

const ViewportSchema = z.object({
  item_ids: z.array(z.string()),
  faces: z.array(FaceSchema),
  current_face: z.number().int().min(0),
  max_per_face: z.number().int().min(0),
  current_item_index: z.number().int().min(0),
})

const ViewportStateSchema = z.object({
  faces: z.array(FaceSchema),
  current_face: z.number().int().min(0),
  current_item_index: z.number().int().min(0),
  remaining_items: z.array(z.string()),
})

type ViewportManager = z.infer<typeof ViewportSchema>
type ViewportState = z.infer<typeof ViewportStateSchema>

type Options = {
  itemIds: Array<string>
  maxPerFace?: number
  onError?: (error: Error) => void
}

export const useFetchViewportWasm = ({
  itemIds,
  maxPerFace = 2,
  onError,
}: Options) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const rotationManagerRef = useRef<ViewportRotation | null>(null)
  const [rotationState, setRotationState] = useState<ViewportState | null>(null)

  const initialize = useCallback(async () => {
    try {
      console.log("this ran: initialize")
      if (rotationManagerRef.current) return
      await init()

      const itemIdsJson = JSON.stringify(itemIds)
      const res = new ViewportRotation(itemIdsJson, maxPerFace)
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
  }, [itemIds, maxPerFace])

  useEffect(() => {
    initialize()

    return (): void => {
      rotationManagerRef.current = null
    }
  }, [])

  const rotateNext = useCallback(() => {
    console.log("this ran: next")
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
    console.log("this ran: nextItem")
    if (!rotationManagerRef.current) return

    try {
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

    return rotationManagerRef.current.get_current_item_id()
  }, [onError])

  const getFaceItemIds = useCallback(
    (idx: number) => {
      if (!rotationManagerRef.current) return null

      try {
        const stateJson = rotationManagerRef.current.get_face_item_ids(idx)
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

  return {
    isLoading,
    error,
    rotationState,
    rotateNext,
    getNextItem,
    getCurrentItem,
    getFaceItemIds,
  }
}
