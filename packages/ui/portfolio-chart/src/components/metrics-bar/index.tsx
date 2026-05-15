import type { Greeks, PLMetrics } from "@portfolio/types"

export type MetricsBarProps = {
  metrics: PLMetrics
  greeks: Greeks
}

function fmtDollar(n: number): string {
  const abs = Math.abs(n)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`
  return n >= 0 ? `+${s}` : `-${s}`
}

type CellProps = {
  label: string
  value: string
  color?: "green" | "red" | "neutral"
}

const Cell: React.FC<CellProps> = ({ label, value, color = "neutral" }) => {
  const colorClass = { green: "text-green-400", red: "text-red-400", neutral: "text-neutral-100" }[color]
  return (
    <div className="flex flex-col gap-0.5 border-r border-neutral-800 px-4 py-3 last:border-r-0">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">{label}</span>
      <span className={`font-mono text-[14px] font-semibold ${colorClass}`}>{value}</span>
    </div>
  )
}

export const MetricsBar: React.FC<MetricsBarProps> = ({ metrics, greeks }) => (
  <div className="flex flex-col">
    <div className="flex border-t border-neutral-800">
      <Cell label="P/L at spot" value={fmtDollar(metrics.plAtSpot)} color={metrics.plAtSpot >= 0 ? "green" : "red"} />
      <Cell label="max profit" value={fmtDollar(metrics.maxProfit)} color="green" />
      <Cell label="max loss" value={fmtDollar(metrics.maxLoss)} color="red" />
      <Cell
        label="P(profit)"
        value={`${(metrics.probProfit * 100).toFixed(0)}%`}
        color={metrics.probProfit >= 0.5 ? "green" : "red"}
      />
      <Cell
        label="breakevens"
        value={metrics.breakevens.length === 0 ? "—" : metrics.breakevens.map((b) => `$${b.toFixed(0)}`).join(" · ")}
      />
    </div>
    <div className="flex border-t border-neutral-800 bg-neutral-900/40">
      <Cell label="Δ delta" value={greeks.delta.toFixed(3)} color={greeks.delta > 0 ? "green" : greeks.delta < 0 ? "red" : "neutral"} />
      <Cell label="Γ gamma" value={greeks.gamma.toFixed(4)} />
      <Cell label="Θ theta/d" value={fmtDollar(greeks.theta * 100)} color={greeks.theta > 0 ? "green" : "red"} />
      <Cell label="ν vega/1%" value={fmtDollar(greeks.vega * 100)} color={greeks.vega > 0 ? "green" : "red"} />
      <Cell label="θ/ν ratio" value={greeks.vega !== 0 ? (greeks.theta / greeks.vega).toFixed(2) : "—"} />
    </div>
  </div>
)
