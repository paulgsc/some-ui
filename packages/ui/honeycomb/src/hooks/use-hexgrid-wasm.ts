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

const HexCellThemeSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  opacity: z.number().optional(),
  filter: z.string().optional(),
})

const HexCellDataSchema = z.object({
  id: z.string(),
  data: z.unknown(),
  theme: HexCellThemeSchema,
})

const HexCellSchema = z.object({
  id: z.string(),
  points: z.array(HexPointSchema),
  color: z.number().optional(),
  content: HexCellDataSchema.optional(),
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
  const [hexCells, setHexCells] = useState<Array<HexRenderData>>([])
  const [validationWarning, setValidationWarning] = useState<string | null>(
    null
  )

  const hexGridRef = useRef<WasmHexGrid | null>(null)

  const getRadius = useCallback(() => {
    return getHexagonalGridRadiusForCellCount(cellCount ?? 1)
  }, [cellCount])

  const generateHexgrid = useCallback(async () => {
    const radius = getRadius()

    const parsed = HexgridInputSchema.safeParse({ radius, hexSize })
    if (!parsed.success) {
      setError(parsed.error.flatten().formErrors.join(", "))
      return
    }

    setIsLoading(true)
    setError(null)
    setValidationWarning(null)

    try {
      await init()
      const hexGrid = new WasmHexGrid(radius, hexSize)
      hexGridRef.current = hexGrid

      const result = hexGrid.get_all_cells_render_data()
      setHexCells(HexGridSchema.parse(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      hexGridRef.current = null
    } finally {
      setIsLoading(false)
    }
  }, [getRadius, hexSize])

  useEffect(() => {
    generateHexgrid()
    return (): void => {
      hexGridRef.current = null
    }
  }, [generateHexgrid])

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
