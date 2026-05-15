import type { Leg } from "@portfolio/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { LegList } from "."
import { LegRow } from "./leg-row"

// ── fixtures ──────────────────────────────────────────────────────────────────

const SHORT_CALL: Leg = {
  id: "sc1",
  optionType: "call",
  side: "short",
  strike: 130,
  expiry: "2025-01-17",
  quantity: 1,
  premium: 2.1,
  iv: 0.72,
}

const LONG_CALL: Leg = {
  id: "lc1",
  optionType: "call",
  side: "long",
  strike: 140,
  expiry: "2025-01-17",
  quantity: 1,
  premium: 0.85,
  iv: 0.72,
}

const SHORT_PUT: Leg = {
  id: "sp1",
  optionType: "put",
  side: "short",
  strike: 108,
  expiry: "2025-01-17",
  quantity: 1,
  premium: 1.75,
  iv: 0.72,
}

const LONG_PUT: Leg = {
  id: "lp1",
  optionType: "put",
  side: "long",
  strike: 98,
  expiry: "2025-01-17",
  quantity: 1,
  premium: 0.7,
  iv: 0.72,
}

const IC_LEGS = [SHORT_CALL, LONG_CALL, SHORT_PUT, LONG_PUT]
const IC_PLS: Record<string, number> = {
  sc1: 210,
  lc1: -85,
  sp1: 175,
  lp1: -70,
}

// ── LegRow stories ────────────────────────────────────────────────────────────

type RowStory = StoryObj<typeof LegRow>
type RowMeta = Meta<typeof LegRow>

export const RowShortCallProfit: RowStory = {
  args: { leg: SHORT_CALL, pl: 210, onRemove: () => {} },
}

export const RowLongCallLoss: RowStory = {
  args: { leg: LONG_CALL, pl: -85, onRemove: () => {} },
}

export const RowShortPutBreakeven: RowStory = {
  args: { leg: SHORT_PUT, pl: 0, onRemove: () => {} },
}

export const LegRowMeta: RowMeta = {
  title: "Sandlot/Components/LegList/LegRow",
  component: LegRow,
  parameters: { layout: "padded" },
  args: { onRemove: () => {} },
}

// ── LegList stories ───────────────────────────────────────────────────────────

type ListStory = StoryObj<typeof LegList>

export const IronCondorLegs: ListStory = {
  args: {
    legs: IC_LEGS,
    legPLs: IC_PLS,
    onRemoveLeg: () => {},
    onAddLegClick: () => {},
  },
}

export const EmptyLegs: ListStory = {
  args: {
    legs: [],
    legPLs: {},
    onRemoveLeg: () => {},
    onAddLegClick: () => {},
  },
}

export const SingleLeg: ListStory = {
  args: {
    legs: [SHORT_CALL],
    legPLs: { sc1: 210 },
    onRemoveLeg: () => {},
    onAddLegClick: () => {},
  },
}

export default {
  title: "Sandlot/Components/LegList",
  component: LegList,
  parameters: { layout: "padded" },
  args: {
    onRemoveLeg: () => {},
    onAddLegClick: () => {},
  },
} as Meta<typeof LegList>
