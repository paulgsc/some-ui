import type { TradeData } from "@portfolio-chart/types/trade-data"
import type { ScaleLinear, ScaleTime } from "d3-scale"
import { motion } from "framer-motion"

interface BarGroupProps {
  data: TradeData[]
  xScale: ScaleTime<number, number>
  yScale: ScaleLinear<number, number>
  height: number
  onBarHover: (trade: TradeData) => void
}

export function BarGroup({
  data,
  xScale,
  yScale,
  height,
  onBarHover,
}: BarGroupProps) {
  const barWidth = Math.min(40, (xScale.range()[1] / data.length) * 0.8)

  return (
    <g>
      {data.map((d, i) => {
        const barHeight = height - yScale(Math.abs(d.value))
        const y = d.value >= 0 ? yScale(d.value) : yScale(0)
        const x = xScale(new Date(d.date)) - barWidth / 2

        return (
          <motion.rect
            key={d.id}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            className={d.value >= 0 ? "fill-success/80" : "fill-destructive/80"}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            onMouseEnter={() => onBarHover(d)}
            whileHover={{ opacity: 1 }}
          />
        )
      })}
    </g>
  )
}
