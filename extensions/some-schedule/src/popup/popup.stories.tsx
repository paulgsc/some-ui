import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

// Import types and constants from refactored FSM [cite: 84, 101]
import { INIT_STATE } from "./fsm"
import type { PopupState } from "./fsm"
// Import the pure render function
import { render } from "./view"

import "./popup.css"

// ── Bridge Component ────────────────────────────────────────────────────────

type PopupBridgeProps = {
  state: PopupState
}

/**
 * The refactored view is a pure function of state.
 * We simply call render() whenever the state prop changes.
 */
const PopupBridge = ({ state }: PopupBridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      // Mock dispatch since stories are static views
      const mockDispatch = (action: any) =>
        console.log("Action dispatched:", action)

      // The refactored view expects a #root element to exist [cite: 110]
      containerRef.current.innerHTML = '<div id="root"></div>'
      render(state, mockDispatch)
    }
  }, [state])

  return (
    <div
      ref={containerRef}
      className="sb-popup-container"
      style={{ width: 350, minHeight: 400, background: "#1a1a1a" }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<PopupBridgeProps> = {
  title: "Extensions/TabSched/Popup",
  component: PopupBridge,
  parameters: { layout: "centered" },
}

export default meta
type Story = StoryObj<PopupBridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Initializing: Story = {
  args: {
    state: INIT_STATE, // [cite: 115]
  },
}

export const Idle: Story = {
  args: {
    state: {
      kind: "IDLE",
      tab_count: 24,
      db_count: 150,
      last_synced_at: new Date(Date.now() - 3600000).toISOString(), // 1h ago [cite: 86]
    },
  },
}

export const SyncingProgress: Story = {
  args: {
    state: {
      kind: "SYNCING",
      completed: 15,
      total: 45, // [cite: 88, 118]
    },
  },
}

export const SyncCompleteWithFailures: Story = {
  args: {
    state: {
      kind: "SYNC_DONE",
      db_count: 165,
      result: {
        upserted: 15,
        failed: 3,
        error_tab_ids: [101, 102, 103, 104, 105, 106], // [cite: 90, 119, 120]
      },
    },
  },
}

export const ReconcileReview: Story = {
  args: {
    state: {
      kind: "RECONCILE_REVIEW",
      result: {
        absent_tab_ids: [501, 502],
        absent_summaries: [
          {
            tab_id: 501,
            url: "https://github.com/reactjs/react",
            tab_title: "GitHub - React",
            domain: "github.com",
            last_seen_at: new Date(Date.now() - 86400000).toISOString(),
            extraction_ok: true,
          },
        ],
      }, // [cite: 94, 124, 127]
    },
  },
}

export const PipelineQueued: Story = {
  args: {
    state: {
      kind: "PIPELINE_QUEUED",
      db_count: 165, // [cite: 97, 128]
    },
  },
}

export const CriticalError: Story = {
  args: {
    state: {
      kind: "ERROR",
      message: "background unreachable: Could not establish connection.", // [cite: 101, 112]
    },
  },
}
