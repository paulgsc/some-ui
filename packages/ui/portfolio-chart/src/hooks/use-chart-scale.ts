import { useMemo } from "react"
import type { ChartDimensions } from "@portfolio-chart/types/chart"
import type { TradeData } from "@portfolio-chart/types/trade-data"
import { extent } from "d3-array"
import { scaleLinear, scaleTime } from "d3-scale"
import type { ScaleLinear, ScaleTime } from "d3-scale"

type ReturnOptions = {
  xScale: ScaleTime<number, number>
  yScale: ScaleLinear<number, number>
  chartWidth: number
  chartHeight: number
}

export function useChartScale(
  data: Array<TradeData>,
  dimensions: ChartDimensions
): ReturnOptions {
  return useMemo(() => {
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
  }, [data, dimensions])
}
