import { useEffect, useMemo, useState } from "react"

import type { ChartDimensions, TradeData } from "../types"
import { extent, initScales, scaleLinear, scaleTime } from "./scales"

export function useChartScale(data: TradeData[], dimensions: ChartDimensions) {
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize WASM module
  useEffect(() => {
    initScales().then(() => {
      setIsInitialized(true)
    })
  }, [])

  return useMemo(() => {
    if (!isInitialized || data.length === 0) {
      // Return placeholder scales until WASM is initialized
      return {
        xScale: (d: any) => 0,
        yScale: (d: any) => 0,
        chartWidth: 0,
        chartHeight: 0,
      }
    }

    const { width, height, margin } = dimensions
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    // Time scale for x-axis
    const xScale = scaleTime()
      .domain(extent(data, (d) => new Date(d.date)) as [Date, Date])
      .range([0, chartWidth])

    // Value scale for y-axis
    const yScale = scaleLinear()
      .domain(extent(data, (d) => d.value) as [number, number])
      .nice()
      .range([chartHeight, 0])

    return {
      xScale,
      yScale,
      chartWidth,
      chartHeight,
    }
  }, [data, dimensions, isInitialized])
}
