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
  faceIndices: z.array(FaceSchema),
  currFace: UsizeSchema,
  currIdx: UsizeSchema,
  currRotationAxis: RotationAxisSchema,
  pendingCount: UsizeSchema,
  cyclePosition: UsizeSchema,
})

type ViewportState = z.infer<typeof ViewportStateSchema>
type DualViewportState = Record<Direction, ViewportState>

type Options = {
  totalItems: number
  cluesDirection: Direction
  stateDirection: Direction
  maxPerFace?: number
  onError?: (error: Error) => void
}

export const useFetchViewportWasm = ({
  totalItems,
  cluesDirection,
  stateDirection,
  maxPerFace = 2,
  onError,
}: Options) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const acrossRotationManagerRef = useRef<ViewportRotation | null>(null)
  const downRotationManagerRef = useRef<ViewportRotation | null>(null)
  const [rotationState, setRotationState] =
    useState<Partial<DualViewportState> | null>(null)

  const initialize = useCallback(async () => {
    try {
      if (cluesDirection === "across" && acrossRotationManagerRef.current)
        return
      if (cluesDirection === "down" && downRotationManagerRef.current) return
      await init()

      // console.log("ran for dir, items,", cluesDirection, totalItems)
      const res = new ViewportRotation(totalItems, maxPerFace)
      if (cluesDirection === "across") acrossRotationManagerRef.current = res
      if (cluesDirection === "down") downRotationManagerRef.current = res

      const initialState = res.get_state()
      setRotationState((prev) => ({
        ...prev,
        [cluesDirection]: ViewportStateSchema.parse(initialState),
      }))
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setRotationState(null)
      acrossRotationManagerRef.current = null
      downRotationManagerRef.current = null
      if (onError) onError(error)
    } finally {
      setIsLoading(false)
    }
  }, [cluesDirection, totalItems, maxPerFace])

  const setRotationAxis = useCallback(
    (axis: RotatationAxis) => {
      if (cluesDirection === "across" && !acrossRotationManagerRef.current)
        return
      if (cluesDirection === "down" && !downRotationManagerRef.current) return

      try {
        const validatedAxis = RotationAxisSchema.parse(axis)
        const stateJson =
          cluesDirection === "across"
            ? acrossRotationManagerRef.current?.set_rotation_axis(
                JSON.stringify(validatedAxis)
              )
            : downRotationManagerRef.current?.set_rotation_axis(
                JSON.stringify(validatedAxis)
              )
        setRotationState((prev) => ({
          ...prev,
          [cluesDirection]: ViewportStateSchema.parse(stateJson),
        }))
      } catch (err) {
        console.error("Error generating crossword:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        setRotationState(null)
        if (onError) onError(error)
      }
    },
    [cluesDirection, onError, totalItems, maxPerFace]
  )

  const rotateNext = useCallback(() => {
    if (cluesDirection === "across" && !acrossRotationManagerRef.current) return
    if (cluesDirection === "down" && !downRotationManagerRef.current) return

    try {
      const stateJson =
        cluesDirection === "across"
          ? acrossRotationManagerRef.current?.rotate_next()
          : downRotationManagerRef.current?.rotate_next()
      setRotationState((prev) => ({
        ...prev,
        [cluesDirection]: ViewportStateSchema.parse(stateJson),
      }))
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setRotationState(null)
      if (onError) onError(error)
    }
  }, [totalItems, maxPerFace, cluesDirection, onError])

  const getNextItem = useCallback(() => {
    if (cluesDirection === "across" && !acrossRotationManagerRef.current) return
    if (cluesDirection === "down" && !downRotationManagerRef.current) return

    try {
      const prevJson =
        cluesDirection === "across"
          ? acrossRotationManagerRef.current?.get_state()
          : downRotationManagerRef.current?.get_state()
      const { currFace, currIdx, faceIndices } =
        ViewportStateSchema.parse(prevJson)

      if (faceIndices[currFace].length <= currIdx + 1) {
        cubeEvents.emit("rotate:next", {})
        rotateNext()
        return
      }

      const stateJson =
        cluesDirection === "across"
          ? acrossRotationManagerRef.current?.next_item()
          : downRotationManagerRef.current?.next_item()
      setRotationState((prev) => ({
        ...prev,
        [cluesDirection]: ViewportStateSchema.parse(stateJson),
      }))
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setRotationState(null)
      if (onError) onError(error)
    }
  }, [onError, totalItems, maxPerFace, cluesDirection])

  const getCurrentItem = useCallback(() => {
    if (cluesDirection === "across" && !acrossRotationManagerRef.current) return
    if (cluesDirection === "down" && !downRotationManagerRef.current) return

    const index =
      cluesDirection === "across"
        ? acrossRotationManagerRef.current?.get_current_item_index()
        : downRotationManagerRef.current?.get_current_item_index()

    return index
  }, [onError, cluesDirection, totalItems, maxPerFace])

  const getFaceItemIds = useCallback(
    (idx: number) => {
      if (cluesDirection === "across" && !acrossRotationManagerRef.current)
        return null
      if (cluesDirection === "down" && !downRotationManagerRef.current)
        return null

      try {
        const stateJson =
          cluesDirection === "across"
            ? acrossRotationManagerRef.current?.get_face_indices(idx)
            : downRotationManagerRef.current?.get_face_indices(idx)
        return FaceSchema.parse(stateJson)
      } catch (err) {
        console.error("Error generating crossword:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        if (onError) onError(error)
        return null
      }
    },
    [onError, totalItems, maxPerFace, cluesDirection]
  )

  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = []

    const unsubNextAcrossCell = notificationEvents.on(
      "reveal:cell:across",
      () => {
        if (cluesDirection === stateDirection) getNextItem()
      }
    )
    unsubscribers.push(unsubNextAcrossCell)

    const unsubNextDownCell = notificationEvents.on("reveal:cell:down", () => {
      if (cluesDirection === stateDirection) getNextItem()
    })
    unsubscribers.push(unsubNextDownCell)

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [cluesDirection, stateDirection, totalItems, maxPerFace])

  useEffect(() => {
    if (totalItems > 0) initialize()

    return (): void => {
      acrossRotationManagerRef.current = null
      downRotationManagerRef.current = null
    }
  }, [cluesDirection, totalItems, maxPerFace, initialize])

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
