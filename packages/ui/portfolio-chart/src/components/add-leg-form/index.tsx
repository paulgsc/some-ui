import { useState } from "react"
import type { Leg, OptionType, Side } from "@portfolio/types"

// Suggested NVDA expiries — consumer can pass their own
export const DEFAULT_EXPIRIES = [
  "2025-01-17",
  "2025-01-24",
  "2025-01-31",
  "2025-02-21",
  "2025-03-21",
]

export type AddLegFormProps = {
  suggestedExpiries?: Array<string>
  defaultStrike?: number
  onAdd: (leg: Omit<Leg, "id">) => void
  onCancel: () => void
}

const OPTION_TYPES: Array<OptionType> = ["call", "put"]
const SIDES: Array<Side> = ["long", "short"]

export const AddLegForm: React.FC<AddLegFormProps> = ({
  suggestedExpiries = DEFAULT_EXPIRIES,
  defaultStrike = 120,
  onAdd,
  onCancel,
}) => {
  const [optionType, setOptionType] = useState<OptionType>("call")
  const [side, setSide] = useState<Side>("short")
  const [strike, setStrike] = useState(defaultStrike)
  const [expiry, setExpiry] = useState(suggestedExpiries[0] ?? "2025-01-17")
  const [quantity, setQuantity] = useState(1)
  const [premium, setPremium] = useState(2.5)
  const [iv, setIV] = useState(72) // displayed as integer pct, stored as fraction

  const handleAdd = () => {
    if (!expiry || strike <= 0 || premium < 0) return
    onAdd({ optionType, side, strike, expiry, quantity, premium, iv: iv / 100 })
  }

  const sideColor: Record<Side, string> = {
    long: "#22c55e",
    short: "#ef4444",
  }
  const sideBg: Record<Side, string> = {
    long: "#14532d",
    short: "#7f1d1d",
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-700 bg-neutral-900 p-3">
      {/* type + side toggles */}
      <div className="flex gap-2">
        {OPTION_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setOptionType(t)}
            className="flex-1 rounded py-1.5 font-mono text-[11px] transition-colors"
            style={{
              background: optionType === t ? "#1d4ed8" : "#1a1a1a",
              color: optionType === t ? "#fff" : "#737373",
              border: optionType === t ? "1px solid #3b82f6" : "1px solid #333",
            }}
          >
            {t}
          </button>
        ))}
        {SIDES.map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className="flex-1 rounded py-1.5 font-mono text-[11px] transition-colors"
            style={{
              background: side === s ? sideBg[s] : "#1a1a1a",
              color: side === s ? sideColor[s] : "#737373",
              border: side === s ? `1px solid ${sideColor[s]}` : "1px solid #333",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* strike + expiry */}
      <div className="flex gap-2">
        <Field label="strike">
          <input type="number" value={strike} step={1} onChange={(e) => setStrike(Number(e.target.value))} className={fieldCls} />
        </Field>
        <Field label="expiry">
          <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className={fieldCls}>
            {suggestedExpiries.map((d) => (
              <option key={d} value={d}>
                {new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* premium + qty + IV */}
      <div className="flex gap-2">
        <Field label="prem">
          <input type="number" value={premium} step={0.05} min={0} onChange={(e) => setPremium(Number(e.target.value))} className={fieldCls} />
        </Field>
        <Field label="qty">
          <input type="number" value={quantity} step={1} min={1} onChange={(e) => setQuantity(Number(e.target.value))} className={fieldCls} />
        </Field>
        <Field label="IV %">
          <input type="number" value={iv} step={1} min={1} max={500} onChange={(e) => setIV(Number(e.target.value))} className={fieldCls} />
        </Field>
      </div>

      {/* actions */}
      <div className="flex gap-2">
        <button onClick={handleAdd} className="flex-1 rounded bg-blue-700 py-1.5 font-mono text-[12px] font-medium text-white transition-colors hover:bg-blue-600">
          add leg
        </button>
        <button onClick={onCancel} className="rounded border border-neutral-700 px-3 py-1.5 font-mono text-[12px] text-neutral-500 transition-colors hover:text-neutral-300">
          cancel
        </button>
      </div>
    </div>
  )
}

const fieldCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-mono text-[12px] text-neutral-100 outline-none focus:border-blue-500"

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-1 flex-col gap-1">
    <label className="font-mono text-[10px] text-neutral-500">{label}</label>
    {children}
  </div>
)
