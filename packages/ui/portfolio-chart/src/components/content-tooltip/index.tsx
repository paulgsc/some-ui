import { Tooltip } from "recharts"
import type { TooltipProps } from "recharts/types/component/Tooltip"

export const ContentTooltip = (): React.JSX.Element => {
  return <Tooltip content={<TooltipContent />} />
}

const TooltipContent = ({ active, payload }: TooltipProps<any, any>) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="rounded border bg-white p-3 shadow-md dark:bg-gray-800">
        <p className="font-medium">
          {data.symbol} - {data.date}
        </p>
        <p
          className={`text-sm ${data.value >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {data.value >= 0 ? "+" : ""}
          {data.value.toFixed(2)}%
        </p>
      </div>
    )
  }
  return null
}
