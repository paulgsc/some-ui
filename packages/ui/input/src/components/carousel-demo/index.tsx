import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { useFetchViewportWasm } from "@input/hooks/use-viewport-rotation-wasm"
import { cn } from "some-ui-utils"

// Type for the component props
type DiceCardProps = {
  className?: string
  dof: string
  faces: Record<string, ReactNode>
  showBeam?: boolean
}

export const DiceCard = ({
  className,
  dof,
  faces,
  showBeam = false,
}: DiceCardProps) => {
  const {
    isLoading,
    error,
    rotationState,
    getCurrentItem,
    rotateNext,
    getNextItem,
    getFaceItemIds,
  } = useFetchViewportWasm({
    itemIds: Array.from({ length: 12 }, (_, i) => `item${i}`),
    maxPerFace: 2,
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!rotationState) return <div> never began!</div>

  console.log("foo")

  return (
    <div>
      <div> Current Face: {rotationState.current_face}</div>
      <div> Current Item: {getCurrentItem()}</div>
      <div>
        {" "}
        Current Face Items:{" "}
        {JSON.stringify(getFaceItemIds(rotationState.current_face))}
      </div>
      <button
        onClick={rotateNext}
        className="cursor-pointer rounded-lg bg-blue-400 p-4 shadow-md"
      >
        Rotate Face
      </button>
      <button
        onClick={getNextItem}
        className="cursor-pointer rounded-lg bg-amber-400 p-4 shadow-md"
      >
        Next Item
      </button>
    </div>
  )
}
