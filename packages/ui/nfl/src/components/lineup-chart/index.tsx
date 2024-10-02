import { useState } from "react"
import { Field } from "@nfl/public"
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import { Select } from "some-ui-shared"

const formationData = {
  offense: {
    "I-Formation": [
      { x: 50, y: 10 },
      { x: 50, y: 20 },
      { x: 45, y: 15 },
      { x: 55, y: 15 },
      { x: 40, y: 5 },
      { x: 60, y: 5 },
      { x: 30, y: 5 },
      { x: 70, y: 5 },
      { x: 20, y: 5 },
      { x: 80, y: 5 },
      { x: 50, y: 5 },
    ],
    Shotgun: [
      { x: 50, y: 20 },
      { x: 40, y: 15 },
      { x: 60, y: 15 },
      { x: 30, y: 15 },
      { x: 70, y: 15 },
      { x: 20, y: 5 },
      { x: 80, y: 5 },
      { x: 40, y: 5 },
      { x: 60, y: 5 },
      { x: 30, y: 5 },
      { x: 70, y: 5 },
    ],
  },
  defense: {
    "4-3": [
      { x: 40, y: 25 },
      { x: 60, y: 25 },
      { x: 30, y: 25 },
      { x: 70, y: 25 },
      { x: 45, y: 35 },
      { x: 55, y: 35 },
      { x: 50, y: 35 },
      { x: 30, y: 45 },
      { x: 50, y: 45 },
      { x: 70, y: 45 },
      { x: 40, y: 45 },
    ],
    "3-4": [
      { x: 40, y: 25 },
      { x: 60, y: 25 },
      { x: 50, y: 25 },
      { x: 30, y: 35 },
      { x: 50, y: 35 },
      { x: 70, y: 35 },
      { x: 40, y: 35 },
      { x: 30, y: 45 },
      { x: 50, y: 45 },
      { x: 70, y: 45 },
      { x: 40, y: 45 },
    ],
  },
} as const

export type FormationTypes = {
  [K in keyof typeof formationData]: keyof (typeof formationData)[K]
}[keyof typeof formationData]

// This type defines the units (offense and defense)
type FormationUnit = keyof typeof formationData

// This type gets the formations for a specific unit
type UnitFormations<U extends FormationUnit> = {
  [K in keyof typeof formationData]: keyof (typeof formationData)[K]
}[U]

const FootballFormationChart = (): JSX.Element => {
  const [offenseFormation, setOffenseFormation] =
    useState<UnitFormations<"offense">>("Shotgun")

  const [defenseFormation, setDefenseFormation] =
    useState<UnitFormations<"defense">>("3-4")

  const data = [
    ...formationData.offense[offenseFormation].map((pos) => ({
      ...pos,
      team: "offense",
    })),
    ...formationData.defense[defenseFormation].map((pos) => ({
      ...pos,
      team: "defense",
    })),
  ]

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <img
        src={Field}
        alt="nfl field"
        className="absolute inset-0 bg-cover bg-center bg-no-repeat  aspect-[11/5.3]"
      />
      <div className="mb-4 flex justify-between">
        <Select
          value={offenseFormation}
          onValueChange={setOffenseFormation}
          options={Object.keys(formationData.offense).map((formation) => ({
            value: formation,
            label: formation,
          }))}
        />
        <Select
          value={defenseFormation}
          onValueChange={setDefenseFormation}
          options={Object.keys(formationData.defense).map((formation) => ({
            value: formation,
            label: formation,
          }))}
        />
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" domain={[0, 100]} tickCount={11} />
          <YAxis type="number" dataKey="y" domain={[0, 50]} reversed />
          <ZAxis type="category" dataKey="team" />

          <Scatter
            data={data}
            shape="square"
            fill={(entry) => (entry.team === "offense" ? "#ff0000" : "#0000ff")}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

export default FootballFormationChart
