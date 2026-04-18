import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { INIT_STATE, SESSIONS_INIT } from "./fsm"
import type { PopupState, SessionsState } from "./fsm"
// 1. Import your actual Pure View and FSM logic [cite: 34, 1]
import { init, render, renderSessions, switchTab } from "./view"
// 2. Import your styles
import "./popup.css"

// ── Bridge Component ────────────────────────────────────────────────────────

type PopupBridgeProps = {
  captureState: PopupState
  sessionsState: SessionsState
  activeTab: "capture" | "sessions"
}

const PopupBridge = ({
  captureState,
  sessionsState,
  activeTab,
}: PopupBridgeProps) => {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rootRef.current) return

    init(rootRef.current)

    render(captureState)
    renderSessions(sessionsState)
    switchTab(activeTab)
  }, [init, captureState, sessionsState, activeTab])

  useEffect(() => {
    if (!rootRef.current) return

    init(rootRef.current)

    return () => {
      if (rootRef.current) {
        rootRef.current = null
      }
    }
  }, [])
  return (
    <div
      ref={rootRef}
      className="sb-popup-container"
      style={{
        width: 350,
        minHeight: 400,
        background: "#1a1a1a",
        border: "1px solid #333",
      }}
    >
      {/* ── Exact HTML Structure from popup.html [cite: 72] ── */}
      <header>
        <span className="wordmark">tabsched</span>
        <span className="badge" id="header-badge">
          capture
        </span>
      </header>

      <nav id="nav-tabs">
        <button className="tab-btn" data-tab="capture">
          capture
        </button>
        <button className="tab-btn" data-tab="sessions">
          sessions
        </button>
      </nav>

      <div id="tab-capture" className="tab-panel">
        <section id="status-section">
          <p id="status-label">—</p>
          <p id="status-sub"></p>
        </section>

        <section id="progress-section" style={{ display: "none" }}>
          <div className="progress-track">
            <div id="progress-fill"></div>
          </div>
          <span id="progress-label"></span>
        </section>

        <section id="actions-section">
          <div className="btn-row">
            <button id="btn-capture-all" className="primary">
              capture all tabs
            </button>
            <button id="btn-capture-active" className="secondary">
              active tab
            </button>
          </div>
        </section>

        <section id="result-section" style={{ display: "none" }}>
          <p id="result-status" className="result-status"></p>
          <table className="result-table">
            <tbody id="result-rows"></tbody>
          </table>
          <div className="btn-row">
            <button id="btn-trigger-pipeline" className="accent">
              trigger pipeline
            </button>
            <button id="btn-again" className="secondary">
              capture again
            </button>
          </div>
        </section>

        <section id="error-section" style={{ display: "none" }}>
          <p id="error-header">error</p>
          <pre id="error-message"></pre>
          <div className="btn-row">
            <button id="btn-dismiss" className="secondary">
              dismiss
            </button>
          </div>
        </section>
      </div>

      <div id="tab-sessions" className="tab-panel" style={{ display: "none" }}>
        <section id="sessions-toolbar">
          <div className="btn-row">
            <button id="btn-refresh-sessions" className="secondary">
              refresh
            </button>
            <button id="btn-trigger-all-pipeline" className="accent">
              run all pending
            </button>
          </div>
        </section>
        <section id="sessions-loading" style={{ display: "none" }}>
          <p className="dim-text">loading sessions…</p>
        </section>
        <section id="sessions-empty" style={{ display: "none" }}>
          <p className="dim-text">no sessions captured yet</p>
        </section>
        <section id="sessions-list"></section>
        <section id="sessions-error" style={{ display: "none" }}>
          <p className="err-text" id="sessions-error-msg"></p>
          <div className="btn-row">
            <button id="btn-sessions-retry" className="secondary">
              retry
            </button>
          </div>
        </section>
      </div>
    </div>
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

export const Initial: Story = {
  args: {
    activeTab: "capture",
    captureState: INIT_STATE,
    sessionsState: SESSIONS_INIT,
  },
}

export const CapturingTabs: Story = {
  args: {
    activeTab: "capture",
    captureState: { kind: "QUERYING_TABS", completed: 12, total: 30 },
    sessionsState: SESSIONS_INIT,
  },
}

export const CaptureSuccess: Story = {
  args: {
    activeTab: "capture",
    captureState: {
      kind: "DONE_SUCCESS",
      summary: {
        session_id: "test-session-123",
        captured_at: new Date().toISOString(),
        captured_ok: 28,
        captured_fail: 2,
        skipped: 5,
        total_tabs: 35,
        pipeline_status: "pending",
      },
    },
    sessionsState: SESSIONS_INIT,
  },
}

export const SessionsList: Story = {
  args: {
    activeTab: "sessions",
    captureState: INIT_STATE,
    sessionsState: {
      kind: "LOADED",
      summaries: [
        {
          session_id: "session-001",
          captured_at: "2026-04-18T10:00:00Z",
          captured_ok: 10,
          captured_fail: 0,
          skipped: 0,
          total_tabs: 10,
          pipeline_status: "done",
        },
        {
          session_id: "session-002",
          captured_at: "2026-04-18T12:00:00Z",
          captured_ok: 5,
          captured_fail: 1,
          skipped: 2,
          total_tabs: 8,
          pipeline_status: "running",
        },
      ],
    },
  },
}

export const TerminalError: Story = {
  args: {
    activeTab: "capture",
    captureState: {
      kind: "ERROR",
      message: "Failed to establish connection to background service worker.",
    },
    sessionsState: SESSIONS_INIT,
  },
}
