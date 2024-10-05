import React, { useCallback, useRef, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface DataItem {
  name: string
  value: number
}

const data: DataItem[] = [
  { name: "Web", value: 400 },
  { name: "Referral", value: 300 },
  { name: "Phone", value: 200 },
  { name: "Postal mail", value: 100 },
  { name: "Fax", value: 50 },
  { name: "Email", value: 25 },
]

const HighlightedBarChart: React.FC = () => {
  const [highlightedBars, setHighlightedBars] = useState<Set<string>>(new Set())
  const [selectionRect, setSelectionRect] = useState<{
    start: [number, number]
    end: [number, number]
  } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (!chartRef.current) return
    const rect = chartRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    setSelectionRect({ start: [x, y], end: [x, y] })
  }, [])

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!selectionRect || !chartRef.current) return
      const rect = chartRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      setSelectionRect((prev) => ({ ...prev!, end: [x, y] }))

      // Calculate which bars are intersecting with the selection rectangle
      const barPaths = chartRef.current.querySelectorAll(
        ".recharts-bar-rectangle path"
      )
      const intersectingBars = new Set<string>()
      barPaths.forEach((pathElement) => {
        const barRect = (pathElement as SVGPathElement).getBoundingClientRect()
        if (isIntersecting(selectionRect.start, [x, y], barRect, rect)) {
          const barName = pathElement.getAttribute("name")

          if (barName) intersectingBars.add(barName)
        }
      })
      console.log("foo foo foo ", intersectingBars)
      setHighlightedBars(intersectingBars)
    },
    [selectionRect]
  )

  const handleMouseUp = useCallback(() => {
    setSelectionRect(null)
  }, [])

  const isIntersecting = (
    start: [number, number],
    end: [number, number],
    barRect: DOMRect,
    chartRect: DOMRect
  ) => {
    const selectionLeft = Math.min(start[0], end[0])
    const selectionRight = Math.max(start[0], end[0])
    const selectionTop = Math.min(start[1], end[1])
    const selectionBottom = Math.max(start[1], end[1])

    const barLeft = barRect.left - chartRect.left
    const barRight = barRect.right - chartRect.left
    const barTop = barRect.top - chartRect.top
    const barBottom = barRect.bottom - chartRect.top

    return !(
      selectionLeft > barRight ||
      selectionRight < barLeft ||
      selectionTop > barBottom ||
      selectionBottom < barTop
    )
  }

  return (
    <div
      className="w-full h-screen p-4 relative"
      ref={chartRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <h1 className="text-2xl font-bold mb-4">
        Bar Chart with Accurate SVG-based Drag-to-Select
        {`foo: ${[...highlightedBars].map((s) => s)}`}
      </h1>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />

          <Bar dataKey="value" fill="#82ca9d" />
        </BarChart>
      </ResponsiveContainer>
      {selectionRect && (
        <div
          style={{
            position: "absolute",
            left: Math.min(selectionRect.start[0], selectionRect.end[0]),
            top: Math.min(selectionRect.start[1], selectionRect.end[1]),
            width: Math.abs(selectionRect.end[0] - selectionRect.start[0]),
            height: Math.abs(selectionRect.end[1] - selectionRect.start[1]),
            border: "1px solid #8884d8",
            backgroundColor: "rgba(136, 132, 216, 0.1)",
            pointerEvents: "none",
          }}
        />
      )}
      <div className="mt-4">
        <p>Click and drag to highlight multiple bars.</p>
        <p>Currently highlighted: {Array.from(highlightedBars).join(", ")}</p>
      </div>
    </div>
  )
}

export default HighlightedBarChart
