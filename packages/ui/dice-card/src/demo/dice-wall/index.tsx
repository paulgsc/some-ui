import type { FC } from "react"
import { useEffect, useMemo, useRef } from "react"
import { DiceCard } from "@dice-card/components/dice-card"
import { cubeEvents } from "@dice-card/hooks/use-rotating-cube"
import { cn } from "some-ui-utils"

const GRID_SIZE = 3
const CONDUCTOR_STEP_MS = 650

const CARD_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-orange-500",
  "bg-lime-600",
]

const ROW_COLORS = ["bg-slate-700", "bg-slate-600", "bg-slate-500"]
const COLUMN_COLORS = ["bg-zinc-700", "bg-zinc-600", "bg-zinc-500"]

const tileFaces = (
  label: string,
  colorClass: string
): Array<React.JSX.Element> =>
  Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={cn(
        colorClass,
        "flex size-full flex-col items-center justify-center gap-1 text-white"
      )}
    >
      <span className="text-[10px] uppercase tracking-widest opacity-70">
        {label}
      </span>
      <span className="text-lg font-semibold">Face {i + 1}</span>
    </div>
  ))

// Cycles through every cube id on a shared interval, one flip per tick, so
// card/row/column rotations never land on the same tick — a wave instead of
// simultaneous, uncoordinated flicker.
function useConductor(cubeIds: Array<number>, stepMs: number): void {
  const indexRef = useRef(0)

  useEffect(() => {
    const id = setInterval(() => {
      const target = cubeIds[indexRef.current % cubeIds.length]
      cubeEvents.emit("rotate:next", { id: target })
      indexRef.current += 1
    }, stepMs)

    return (): void => clearInterval(id)
  }, [cubeIds, stepMs])
}

export type DiceWallProps = {
  className?: string
}

export const DiceWall: FC<DiceWallProps> = ({ className }) => {
  const cardIds = useMemo(
    () => Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i),
    []
  )
  const rowIds = useMemo(
    () => Array.from({ length: GRID_SIZE }, (_, i) => 100 + i),
    []
  )
  const columnIds = useMemo(
    () => Array.from({ length: GRID_SIZE }, (_, i) => 200 + i),
    []
  )

  useConductor(
    useMemo(
      () => [...cardIds, ...rowIds, ...columnIds],
      [cardIds, rowIds, columnIds]
    ),
    CONDUCTOR_STEP_MS
  )

  return (
    <div className={cn("flex flex-col gap-10", className)}>
      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
          Cards — each cell rotates on its own
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {cardIds.map((id, i) => (
            <DiceCard
              key={id}
              cubeId={id}
              mode="manual"
              dof="Y-axis"
              className="aspect-square w-full"
              faces={tileFaces(
                `Card ${i + 1}`,
                CARD_COLORS[i % CARD_COLORS.length] ?? "bg-sky-500"
              )}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
          Rows — flip on the X-axis so the wide face doesn&apos;t stretch
        </h3>
        <div className="flex flex-col gap-4">
          {rowIds.map((id, i) => (
            <DiceCard
              key={id}
              cubeId={id}
              mode="manual"
              dof="X-axis"
              className="h-24 w-full"
              faces={tileFaces(
                `Row ${i + 1}`,
                ROW_COLORS[i % ROW_COLORS.length] ?? "bg-slate-700"
              )}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
          Columns — flip on the Y-axis so the tall face doesn&apos;t stretch
        </h3>
        <div className="flex gap-4">
          {columnIds.map((id, i) => (
            <DiceCard
              key={id}
              cubeId={id}
              mode="manual"
              dof="Y-axis"
              className="h-72 w-24"
              faces={tileFaces(
                `Col ${i + 1}`,
                COLUMN_COLORS[i % COLUMN_COLORS.length] ?? "bg-zinc-700"
              )}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
