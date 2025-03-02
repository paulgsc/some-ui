import type { TradeData } from "@portfolio-chart/types/trade-data"
import * as d3 from "d3"

export function renderRegressionLine(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  regressionData: Array<{ x: number; y: number }>,
  visibleData: Array<TradeData>
): void {
  const line = d3
    .line<{ x: number; y: number }>()
    .x((d) => xScale(visibleData[d.x]?.date) || 0)
    .y((d) => yScale(d.y))
    .curve(d3.curveCardinal.tension(0.5))

  g.append("path")
    .datum(regressionData)
    .attr("fill", "none")
    .attr("stroke", "rgb(249, 115, 22)")
    .attr("stroke-width", 2)
    .attr("d", line)
}
