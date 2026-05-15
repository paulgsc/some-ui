import type { Leg } from "@portfolio/types"
import { LegRow } from "./leg-row"

export type LegListProps = {
  legs: Array<Leg>
  legPLs: Record<string, number>
  onRemoveLeg: (id: string) => void
  onAddLegClick: () => void // consumer controls the form — we just emit the intent
}

export const LegList: React.FC<LegListProps> = ({
  legs,
  legPLs,
  onRemoveLeg,
  onAddLegClick,
}) => (
  <div className="flex flex-col gap-2">
    {legs.map((leg) => (
      <LegRow key={leg.id} leg={leg} pl={legPLs[leg.id] ?? 0} onRemove={onRemoveLeg} />
    ))}
    <button
      onClick={onAddLegClick}
      className="flex items-center gap-2 rounded border border-dashed border-neutral-700 px-3 py-2 font-mono text-[11px] text-neutral-500 transition-colors hover:border-neutral-500 hover:text-neutral-300"
    >
      <span className="text-lg leading-none">+</span>
      add leg
    </button>
  </div>
)
