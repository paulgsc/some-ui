import type { Dispatch, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { HexRenderData } from "@honeycomb/types/hex-grid"
import { getHexagonalGridRadiusForCellCount } from "@honeycomb/utils/hexagon-math"
import { initializeWasm } from "@honeycomb/utils/wasm-init"
import { WasmHexGrid } from "@some-ui/some-hexagon"
import { z } from "zod"

// radius 0 is a valid single-cell grid (the minimum a fitting engine can
// negotiate down to), so this must accept zero, not just positive integers.
const RadiusSchema = z.number().int().nonnegative()
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

/**
 * Pure helper function isolated from React state.
 * Handles WASM inititialization, generation, and validation.
 */
export async function buildHexgrid(
  radius: number,
  hexSize: number
): Promise<{ hexGrid: WasmHexGrid; cells: Array<HexRenderData> }> {
  await initializeWasm()
  const hexGrid = new WasmHexGrid(radius, hexSize)
  const result = hexGrid.get_all_cells_render_data()
  const cells = HexGridSchema.parse(result)

  return { hexGrid, cells }
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

  const regenerate = useCallback(async () => {
    const radius = getRadius()

    const parsed = HexgridInputSchema.safeParse({ radius, hexSize })
    if (!parsed.success) {
      const tree = z.treeifyError(parsed.error)
      setError(tree.errors.join(", "))
      return
    }

    setIsLoading(true)
    setError(null)
    setValidationWarning(null)

    try {
      const { hexGrid, cells } = await buildHexgrid(radius, hexSize)
      hexGridRef.current = hexGrid
      setHexCells(cells)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      hexGridRef.current = null
    } finally {
      setIsLoading(false)
    }
  }, [getRadius, hexSize])

  useEffect(() => {
    let active = true

    const initialize = async (): Promise<void> => {
      if (!active) return
      await regenerate()
    }

    void initialize()

    return (): void => {
      active = false
      hexGridRef.current = null
    }
  }, [regenerate])

  return {
    isLoading,
    error,
    hexCells,
    validationWarning,
    regenerate,
    hexGridRef,
    setHexCells,
    getRadius,
  }
}
