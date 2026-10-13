import { useEffect, useState } from "react"
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
  className: z.string().optional(),
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

/** A grid's geometry as `HexGrid` renders it, and the load that produced it. */
export type HexGridGeometry = {
  /** The radius and hex circumradius (px) the cells were requested at. */
  radius: number
  hexSize: number
  isLoading: boolean
  error: string | null
  /** The last cells that loaded; kept while a new size loads or fails. */
  hexCells: Array<HexRenderData>
}

type Loaded = {
  radius: number
  hexSize: number
  error: string | null
  cells: Array<HexRenderData>
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

export function useHexgridWasm({
  cellCount,
  hexSize,
}: Options): HexGridGeometry {
  const radius = getHexagonalGridRadiusForCellCount(cellCount ?? 1)
  const parsed = HexgridInputSchema.safeParse({ radius, hexSize })
  const inputError = parsed.success
    ? null
    : z.treeifyError(parsed.error).errors.join(", ")

  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect((): (() => void) | undefined => {
    if (inputError !== null) return undefined

    let active = true
    buildHexgrid(radius, hexSize).then(
      ({ cells }) => {
        if (active) setLoaded({ radius, hexSize, error: null, cells })
      },
      (err: unknown) => {
        if (!active) return
        const error = err instanceof Error ? err.message : "Unknown error"
        setLoaded((prev) => ({
          radius,
          hexSize,
          error,
          cells: prev?.cells ?? [],
        }))
      }
    )
    return (): void => {
      active = false
    }
  }, [radius, hexSize, inputError])

  const hexCells = loaded?.cells ?? []
  if (inputError !== null) {
    return { radius, hexSize, isLoading: false, error: inputError, hexCells }
  }
  const isCurrent = loaded?.radius === radius && loaded.hexSize === hexSize
  return {
    radius,
    hexSize,
    isLoading: !isCurrent,
    error: isCurrent ? loaded.error : null,
    hexCells,
  }
}
