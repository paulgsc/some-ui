import { useMemo, useState } from "react"
import {
  AddLegForm,
  LegList,
  MetricsBar,
  MotifPanel,
  PLChart,
  SimControls,
  TopBar,
} from "@portfolio/components"
import {
  ARCHETYPE_DESCRIPTIONS,
  buildPLCurve,
  computeNetGreeks,
  computePLMetrics,
  detectArchetype,
  legPLAtSpot,
} from "@portfolio/lib"
import type { Leg, MotifPoint, SimState } from "@portfolio/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

// ── helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 8)
}

// ── full composition ──────────────────────────────────────────────────────────

type SandlotAppProps = {
  initialLegs?: Array<Leg>
  initialMotif?: Array<MotifPoint>
  initialName?: string
  initialSim?: Partial<SimState>
}

const SandlotApp: React.FC<SandlotAppProps> = ({
  initialLegs = [],
  initialMotif = [],
  initialName = "untitled position",
  initialSim = {},
}) => {
  const [legs, setLegs] = useState<Array<Leg>>(initialLegs)
  const [motifPoints, setMotifPoints] =
    useState<Array<MotifPoint>>(initialMotif)
  const [positionName, setPositionName] = useState(initialName)
  const [sim, setSim] = useState<SimState>({
    spot: 118,
    dte: 21,
    ivShift: 0,
    ...initialSim,
  })
  const [addingLeg, setAddingLeg] = useState(false)

  // derived: pure computations
  const curve = useMemo(
    () => buildPLCurve(legs, sim.spot, sim.dte, sim.ivShift),
    [legs, sim]
  )
  const legPLs = useMemo(() => {
    const out: Record<string, number> = {}
    for (const leg of legs)
      out[leg.id] = legPLAtSpot(leg, sim.spot, sim.dte, sim.ivShift)
    return out
  }, [legs, sim])
  const metrics = useMemo(
    () => computePLMetrics(curve, sim.spot, legs, sim.dte, sim.ivShift),
    [curve, sim, legs]
  )
  const greeks = useMemo(
    () => computeNetGreeks(legs, sim.spot, sim.dte, sim.ivShift),
    [legs, sim]
  )
  const archetype = useMemo(() => detectArchetype(legs), [legs])
  const archetypeDesc = ARCHETYPE_DESCRIPTIONS[archetype]

  // actions
  const addLeg = (leg: Omit<Leg, "id">) => {
    setLegs((ls) => [...ls, { ...leg, id: uid() }])
    setAddingLeg(false)
  }
  const removeLeg = (id: string) =>
    setLegs((ls) => ls.filter((l) => l.id !== id))
  const toggleMotif = (id: string) =>
    setMotifPoints((ps) =>
      ps.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))
    )
  const addMotif = (text: string) =>
    setMotifPoints((ps) => [...ps, { id: uid(), text, checked: false }])
  const removeMotif = (id: string) =>
    setMotifPoints((ps) => ps.filter((p) => p.id !== id))
  const updateMotif = (id: string, text: string) =>
    setMotifPoints((ps) => ps.map((p) => (p.id === id ? { ...p, text } : p)))
  const reset = () => {
    setLegs([])
    setMotifPoints([])
    setPositionName("untitled position")
    setSim({ spot: 118, dte: 21, ivShift: 0 })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      <TopBar
        spot={sim.spot}
        positionName={positionName}
        archetype={archetype}
        archetypeDesc={archetypeDesc}
        onPositionNameChange={setPositionName}
        onReset={reset}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* left panel */}
        <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-neutral-800">
          <div className="border-b border-neutral-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                position legs
              </span>
              {legs.length > 0 && (
                <span className="font-mono text-[10px] text-neutral-600">
                  {legs.length} leg{legs.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <LegList
              legs={legs}
              legPLs={legPLs}
              onRemoveLeg={removeLeg}
              onAddLegClick={() => setAddingLeg(true)}
            />
            {addingLeg && (
              <div className="mt-2">
                <AddLegForm
                  defaultStrike={Math.round(sim.spot / 5) * 5}
                  onAdd={addLeg}
                  onCancel={() => setAddingLeg(false)}
                />
              </div>
            )}
          </div>

          {legs.length > 0 && (
            <div className="border-b border-neutral-800 p-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                net greeks
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Δ delta",
                    v: greeks.delta.toFixed(3),
                    c:
                      greeks.delta > 0
                        ? "#22c55e"
                        : greeks.delta < 0
                          ? "#ef4444"
                          : "#737373",
                  },
                  {
                    label: "Γ gamma",
                    v: greeks.gamma.toFixed(4),
                    c: "#737373",
                  },
                  {
                    label: "Θ theta/d",
                    v: `$${(greeks.theta * 100).toFixed(1)}`,
                    c: greeks.theta > 0 ? "#22c55e" : "#ef4444",
                  },
                  {
                    label: "ν vega/1%",
                    v: `$${(greeks.vega * 100).toFixed(1)}`,
                    c: greeks.vega > 0 ? "#22c55e" : "#ef4444",
                  },
                ].map(({ label, v, c }) => (
                  <div key={label} className="rounded bg-neutral-900 px-3 py-2">
                    <div className="font-mono text-[10px] text-neutral-600">
                      {label}
                    </div>
                    <div
                      className="font-mono text-[13px] font-semibold"
                      style={{ color: c }}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
              thesis · talking points
            </div>
            <MotifPanel
              points={motifPoints}
              onToggle={toggleMotif}
              onAdd={addMotif}
              onRemove={removeMotif}
              onUpdate={updateMotif}
            />
          </div>
        </div>

        {/* right panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="relative flex-1 p-5">
            {legs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <span className="font-mono text-[13px] text-neutral-700">
                  no legs added yet
                </span>
                <span className="font-mono text-[11px] text-neutral-800">
                  add legs in the left panel to see the P/L surface
                </span>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-neutral-600">
                    P/L surface · NVDA ·{" "}
                    <span className="text-neutral-400">
                      DTE {sim.dte}d · IV {sim.ivShift >= 0 ? "+" : ""}
                      {(sim.ivShift * 100).toFixed(0)}%
                    </span>
                  </span>
                  <div className="flex items-center gap-3 font-mono text-[10px] text-neutral-700">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4 bg-green-500 opacity-40" />
                      profit
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4 bg-red-500 opacity-40" />
                      loss
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4 bg-blue-500" />
                      P/L curve
                    </span>
                  </div>
                </div>
                <div className="h-[calc(100%-2rem)]">
                  <PLChart
                    curve={curve}
                    spot={sim.spot}
                    breakevens={metrics.breakevens}
                    className="h-full w-full"
                  />
                </div>
              </>
            )}
          </div>

          <SimControls
            sim={sim}
            onSpotChange={(v) => setSim((s) => ({ ...s, spot: v }))}
            onDTEChange={(v) => setSim((s) => ({ ...s, dte: v }))}
            onIVShiftChange={(v) => setSim((s) => ({ ...s, ivShift: v }))}
          />

          <MetricsBar metrics={metrics} greeks={greeks} />
        </div>
      </div>
    </div>
  )
}

// ── stories ───────────────────────────────────────────────────────────────────

type Story = StoryObj<typeof SandlotApp>

const meta: Meta<typeof SandlotApp> = {
  title: "Sandlot/App",
  component: SandlotApp,
  parameters: { layout: "fullscreen" },
}

export default meta

export const EmptyState: Story = {}

export const IronCondor: Story = {
  args: {
    initialName: "NVDA IC Jan17",
    initialSim: { spot: 118 },
    initialLegs: [
      {
        id: "sc",
        optionType: "call",
        side: "short",
        strike: 130,
        expiry: "2025-01-17",
        quantity: 1,
        premium: 2.1,
        iv: 0.72,
      },
      {
        id: "lc",
        optionType: "call",
        side: "long",
        strike: 140,
        expiry: "2025-01-17",
        quantity: 1,
        premium: 0.85,
        iv: 0.72,
      },
      {
        id: "sp",
        optionType: "put",
        side: "short",
        strike: 108,
        expiry: "2025-01-17",
        quantity: 1,
        premium: 1.75,
        iv: 0.72,
      },
      {
        id: "lp",
        optionType: "put",
        side: "long",
        strike: 98,
        expiry: "2025-01-17",
        quantity: 1,
        premium: 0.7,
        iv: 0.72,
      },
    ],
    initialMotif: [
      {
        id: "1",
        text: "short premium strangle around weekly NVDA ATR",
        checked: false,
      },
      {
        id: "2",
        text: "targeting theta decay within 1σ range",
        checked: false,
      },
      {
        id: "3",
        text: "no directional bias — delta-neutral entry",
        checked: false,
      },
      {
        id: "4",
        text: "exit at 50% max profit or 21 DTE, whichever first",
        checked: false,
      },
    ],
  },
}

export const ShortStrangle: Story = {
  args: {
    initialName: "NVDA strangle Jan24",
    initialSim: { spot: 118 },
    initialLegs: [
      {
        id: "sc2",
        optionType: "call",
        side: "short",
        strike: 132,
        expiry: "2025-01-24",
        quantity: 2,
        premium: 1.8,
        iv: 0.75,
      },
      {
        id: "sp2",
        optionType: "put",
        side: "short",
        strike: 105,
        expiry: "2025-01-24",
        quantity: 2,
        premium: 1.6,
        iv: 0.75,
      },
    ],
    initialMotif: [
      { id: "1", text: "no wing protection — pure short vol", checked: false },
      {
        id: "2",
        text: "post-earnings IV elevated — wider strikes justified",
        checked: false,
      },
      {
        id: "3",
        text: "watching 1σ boundaries at $104 / $135",
        checked: false,
      },
    ],
  },
}

export const LongPut: Story = {
  args: {
    initialName: "NVDA hedge",
    initialLegs: [
      {
        id: "lp2",
        optionType: "put",
        side: "long",
        strike: 100,
        expiry: "2025-03-21",
        quantity: 3,
        premium: 3.2,
        iv: 0.68,
      },
    ],
    initialMotif: [
      {
        id: "1",
        text: "tail hedge against long stock position",
        checked: false,
      },
      {
        id: "2",
        text: "buying downside at elevated IV — expensive but necessary",
        checked: false,
      },
    ],
  },
}
