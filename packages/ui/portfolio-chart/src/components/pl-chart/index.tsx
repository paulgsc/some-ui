import { useMemo, useRef, useState } from "react"
import type { PLPoint } from "@portfolio/types"

export type PLChartProps = {
  curve: Array<PLPoint>
  spot: number
  breakevens: Array<number>
  className?: string
}

const W = 600
const H = 260
const PAD = { top: 16, right: 20, bottom: 32, left: 56 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

function sx(spot: number, lo: number, hi: number): number {
  return PAD.left + ((spot - lo) / (hi - lo)) * IW
}
function sy(pl: number, lo: number, hi: number): number {
  return PAD.top + IH - ((pl - lo) / (hi - lo)) * IH
}
function fmtPL(n: number): string {
  const abs = Math.abs(n)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`
  return n >= 0 ? `+${s}` : `-${s}`
}
function fmtSpot(n: number): string {
  return `$${n.toFixed(0)}`
}

export const PLChart: React.FC<PLChartProps> = ({
  curve,
  spot,
  breakevens,
  className = "",
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{
    x: number
    y: number
    spot: number
    pl: number
  } | null>(null)

  const derived = useMemo(() => {
    if (curve.length < 2) return null
    const spots = curve.map((p) => p.spot)
    const pls = curve.map((p) => p.pl)
    const minSpot = Math.min(...spots)
    const maxSpot = Math.max(...spots)
    const rawMin = Math.min(...pls)
    const rawMax = Math.max(...pls)
    const pad = (rawMax - rawMin) * 0.15 || 100
    const minPL = rawMin - pad
    const maxPL = rawMax + pad

    const path = curve
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${sx(p.spot, minSpot, maxSpot).toFixed(1)},${sy(p.pl, minPL, maxPL).toFixed(1)}`
      )
      .join(" ")

    const zeroY = sy(0, minPL, maxPL)
    const spotX = sx(spot, minSpot, maxSpot)

    const yStep = (() => {
      const range = maxPL - minPL
      if (range > 5000) return 1000
      if (range > 1000) return 500
      if (range > 200) return 100
      return 50
    })()
    const yTicks: Array<number> = []
    const lo = Math.ceil(minPL / yStep) * yStep
    for (let v = lo; v <= maxPL + 0.5; v += yStep) yTicks.push(v)

    const xTicks = [0, 0.25, 0.5, 0.75, 1].map(
      (t) => minSpot + t * (maxSpot - minSpot)
    )

    return {
      minSpot,
      maxSpot,
      minPL,
      maxPL,
      path,
      zeroY,
      spotX,
      yTicks,
      xTicks,
    }
  }, [curve, spot])

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!derived || !svgRef.current || curve.length < 2) return
    const rect = svgRef.current.getBoundingClientRect()
    const frac = Math.max(
      0,
      Math.min(1, (((e.clientX - rect.left) / rect.width) * W - PAD.left) / IW)
    )
    const idx = Math.round(frac * (curve.length - 1))
    const pt = curve[idx]
    if (!pt) return
    setHover({
      x: sx(pt.spot, derived.minSpot, derived.maxSpot),
      y: sy(pt.pl, derived.minPL, derived.maxPL),
      spot: pt.spot,
      pl: pt.pl,
    })
  }

  if (!derived) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <span className="font-mono text-[12px] text-neutral-700">
          add legs to see P/L surface
        </span>
      </div>
    )
  }

  const { minSpot, maxSpot, minPL, maxPL, path, zeroY, spotX, yTicks, xTicks } =
    derived
  const clampedZero = Math.min(Math.max(zeroY, PAD.top), PAD.top + IH)

  const profitArea = `${path} L${sx(curve[curve.length - 1]!.spot, minSpot, maxSpot).toFixed(1)},${clampedZero} L${sx(curve[0]!.spot, minSpot, maxSpot).toFixed(1)},${clampedZero} Z`
  const lossArea = profitArea

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ width: "100%", height: "100%", overflow: "visible" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label="P/L curve — simulated NVDA options position"
    >
      <defs>
        <clipPath id="sl-profit">
          <rect
            x={PAD.left}
            y={PAD.top}
            width={IW}
            height={clampedZero - PAD.top}
          />
        </clipPath>
        <clipPath id="sl-loss">
          <rect
            x={PAD.left}
            y={clampedZero}
            width={IW}
            height={PAD.top + IH - clampedZero}
          />
        </clipPath>
        <clipPath id="sl-chart">
          <rect x={PAD.left} y={PAD.top} width={IW} height={IH} />
        </clipPath>
      </defs>

      {/* grid */}
      {yTicks.map((v) => {
        const y = sy(v, minPL, maxPL)
        if (y < PAD.top || y > PAD.top + IH) return null
        return (
          <line
            key={v}
            x1={PAD.left}
            x2={PAD.left + IW}
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeOpacity={v === 0 ? 0.2 : 0.06}
            strokeWidth={v === 0 ? 1.5 : 0.5}
          />
        )
      })}

      {/* fills */}
      <path
        d={profitArea}
        fill="#22c55e"
        fillOpacity={0.1}
        clipPath="url(#sl-profit)"
      />
      <path
        d={lossArea}
        fill="#ef4444"
        fillOpacity={0.1}
        clipPath="url(#sl-loss)"
      />

      {/* P/L curve */}
      <path
        d={path}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        clipPath="url(#sl-chart)"
      />

      {/* y labels */}
      {yTicks.map((v) => {
        const y = sy(v, minPL, maxPL)
        if (y < PAD.top - 4 || y > PAD.top + IH + 4) return null
        return (
          <text
            key={v}
            x={PAD.left - 6}
            y={y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.4}
          >
            {v === 0 ? "$0" : fmtPL(v)}
          </text>
        )
      })}

      {/* x labels */}
      {xTicks.map((v, i) => (
        <text
          key={i}
          x={sx(v, minSpot, maxSpot)}
          y={PAD.top + IH + 18}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
          fillOpacity={0.4}
        >
          {fmtSpot(v)}
        </text>
      ))}

      {/* breakeven lines */}
      {breakevens.map((be, i) => {
        const bx = sx(be, minSpot, maxSpot)
        if (bx < PAD.left || bx > PAD.left + IW) return null
        return (
          <g key={i}>
            <line
              x1={bx}
              x2={bx}
              y1={PAD.top}
              y2={PAD.top + IH}
              stroke="currentColor"
              strokeOpacity={0.25}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={bx}
              y={PAD.top - 5}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.45}
            >
              BE {fmtSpot(be)}
            </text>
          </g>
        )
      })}

      {/* spot line */}
      {spotX >= PAD.left && spotX <= PAD.left + IW && (
        <g>
          <line
            x1={spotX}
            x2={spotX}
            y1={PAD.top}
            y2={PAD.top + IH}
            stroke="#3b82f6"
            strokeOpacity={0.65}
            strokeWidth={1.5}
          />
          <text
            x={spotX}
            y={PAD.top + IH + 18}
            textAnchor="middle"
            fontSize={10}
            fill="#3b82f6"
            fontWeight={600}
          >
            {fmtSpot(spot)}
          </text>
        </g>
      )}

      {/* hover */}
      {hover && (
        <g>
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PAD.top}
            y2={PAD.top + IH}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
          />
          <circle
            cx={hover.x}
            cy={hover.y}
            r={4}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={1.5}
          />
          <rect
            x={hover.x + 8}
            y={hover.y - 20}
            width={78}
            height={34}
            rx={4}
            fill="#111"
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={0.5}
          />
          <text
            x={hover.x + 16}
            y={hover.y - 7}
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.55}
          >
            {fmtSpot(hover.spot)}
          </text>
          <text
            x={hover.x + 16}
            y={hover.y + 9}
            fontSize={11}
            fontWeight={600}
            fill={hover.pl >= 0 ? "#22c55e" : "#ef4444"}
          >
            {fmtPL(hover.pl)}
          </text>
        </g>
      )}
    </svg>
  )
}
