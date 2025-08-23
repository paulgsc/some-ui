import type { Dispatch, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { HexRenderData } from "@honeycomb/types/hex-grid"
import { getHexagonalGridRadiusForCellCount } from "@honeycomb/utils/hexagon-math"
import init, { WasmHexGrid } from "some-hexagon"
import { z } from "zod"

const RadiusSchema = z.number().positive()
const HexSizeSchema = z.number().positive().int()

const HexgridInputSchema = z.object({
  radius: RadiusSchema,
  hexSize: HexSizeSchema,
})

const HexPointSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const HexCellSchema = z.object({
  id: z.string(),
  points: z.array(HexPointSchema),
  color: z.number().optional(),
  content: z.string().optional(),
})

const HexGridSchema = z.array(HexCellSchema)

type Options = {
  cellCount?: number
  hexSize: number
}

type ReturnOptions = {
  isLoading: boolean
  error: string | null
  validationWarning: string | null
  hexCells: Array<HexRenderData>
  regenerate: () => Promise<void>
  hexGridRef: RefObject<WasmHexGrid | null>
  setHexCells: Dispatch<SetStateAction<Array<HexRenderData>>>
  getRadius: () => number
}

export function useHexgridWasm({ cellCount, hexSize }: Options): ReturnOptions {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hexGridRef = useRef<WasmHexGrid | null>(null)
  const [hexCells, setHexCells] = useState<Array<HexRenderData>>([])
  const [validationWarning, setValidationWarning] = useState<string | null>(
    null
  )

  const getRadius = useCallback(() => {
    return getHexagonalGridRadiusForCellCount(cellCount ?? 1)
  }, [cellCount])

  const generateHexgrid = useCallback(async () => {
    // Validate inputs with Zod
    const radius = getRadius()

    const result = HexgridInputSchema.safeParse({ radius, hexSize })

    if (!result.success) {
      const errorMessage = result.error.flatten().formErrors.join(", ")
      setError(errorMessage)
      return
    }

    setIsLoading(true)
    setError(null)
    setValidationWarning(null)

    try {
      // Initialize the WASM module
      await init()
      const hexGrid = new WasmHexGrid(radius, hexSize)
      hexGridRef.current = hexGrid

      const result = hexGrid.get_all_cells_render_data()
      const validatedResult = HexGridSchema.parse(result)
      setHexCells(validatedResult)
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      hexGridRef.current = null
    } finally {
      setIsLoading(false)
    }
  }, [cellCount, hexSize])

  useEffect(() => {
    generateHexgrid()

    return (): void => {
      if (hexGridRef.current) hexGridRef.current = null
    }
  }, [generateHexgrid, cellCount, hexSize])

  return {
    isLoading,
    error,
    hexCells,
    validationWarning,
    regenerate: generateHexgrid,
    hexGridRef,
    setHexCells,
    getRadius,
  }
}
