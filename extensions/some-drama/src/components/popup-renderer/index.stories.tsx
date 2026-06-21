import "@drama/styles/popup.css"

import { useEffect, useRef } from "react"
import { PopupStateMachine } from "@drama/lib/popup/fsm"
import type { DramaEntry, PopupPhase, WatchlistState } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { PopupRenderer } from "."

// ── Mock FSM ──────────────────────────────────────────────────────────────────
// Subclasses PopupStateMachine to override browser-dependent methods with
// console stubs. The constructor subscriber handles transition() logging;
// all async operations log and resolve immediately so Storybook never touches
// browser.runtime or browser.tabs.

class MockFsm extends PopupStateMachine {
  constructor() {
    super((phase) => {
      // eslint-disable-next-line no-console
      console.log("[MockFSM] transition →", phase.tag)
    })
  }

  override boot(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockFSM] boot")
    return Promise.resolve()
  }

  override triggerScrape(
    _state: WatchlistState,
    _tabId: number
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockFSM] triggerScrape")
    return Promise.resolve()
  }

  override saveEntry(
    _entry: Partial<DramaEntry> & { title: string },
    _state: WatchlistState,
    _tabId: number
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockFSM] saveEntry")
    return Promise.resolve()
  }

  override setActive(_id: string, _tabId: number): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockFSM] setActive")
    return Promise.resolve()
  }

  override removeEntry(_id: string, _tabId: number): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockFSM] removeEntry")
    return Promise.resolve()
  }

  override refreshEntry(
    _entry: DramaEntry,
    _tabId: number,
    _state: WatchlistState
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockFSM] refreshEntry")
    return Promise.resolve()
  }
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_ENTRY_1: DramaEntry = {
  id: "m1",
  addedAt: Date.now() - 86400000,
  title: "Queen of Tears",
  episode: "Ep 12 / 16",
  network: "tvN",
  year: "2024",
  genre: "Romance, Melodrama",
  note: "",
  color: "#ff6b6b",
  url: "https://www.viki.com/tv/queen-of-tears",
  posterUrl: null,
  timestamp: "27:53",
  progress: 0.63,
  isPlaying: true,
  rating: 9,
  completionLikelihood: 0.92,
  activeMood: "love",
  featuredQuote: "Don't look at me like that",
  emotionLabel: "heart eyes",
  overallProgress: 0.74,
  axes: { connection: 70, hope: -30, trust: -80, control: 40 },
  transition: { before: "hopeful", after: "devastated" },
  tags: ["handTouch", "reveal"],
  peakLine: "The umbrella scene in the rain",
  momentum: { value: 75, direction: "falling" },
}

const MOCK_ENTRY_2: DramaEntry = {
  id: "m2",
  addedAt: Date.now() - 172800000,
  title: "Alchemy of Souls",
  episode: "Ep 20 / 20",
  network: "tvN",
  year: "2022",
  genre: "Fantasy, Historical",
  note: "Finished both parts",
  color: "#818cf8",
  url: "https://www.netflix.com/title/81498462",
  posterUrl: null,
  timestamp: "52:08",
  progress: 0.95,
  isPlaying: false,
  rating: 9,
  completionLikelihood: 1.0,
  activeMood: "joy",
  featuredQuote: "I'll remember you in every life",
  emotionLabel: "bittersweet finale",
  overallProgress: 0.98,
  axes: { connection: 80, hope: 60, trust: 70, control: 40 },
  transition: { before: "heartbroken", after: "at peace" },
  tags: ["goodbye", "sacrifice", "promise"],
  peakLine: "The snow scene in part 2",
  momentum: { value: 60, direction: "steady" },
}

const MOCK_ENTRY_3: DramaEntry = {
  id: "m3",
  addedAt: Date.now() - 259200000,
  title: "The Glory",
  episode: "Ep 8 / 16",
  network: "Netflix",
  year: "2022",
  genre: "Revenge Thriller",
  note: "",
  color: "#f97316",
  url: "https://www.netflix.com/title/81519437",
  posterUrl: null,
  timestamp: "41:12",
  progress: 0.88,
  isPlaying: false,
  rating: 10,
  completionLikelihood: 0.97,
  activeMood: "tension",
  featuredQuote: "You'll pay for every single thing",
  emotionLabel: "on edge",
  overallProgress: 0.49,
  axes: { connection: -60, hope: -20, trust: -90, control: 80 },
  transition: { before: "powerless", after: "inevitable" },
  tags: ["reveal", "argument"],
  peakLine: "The rooftop confrontation",
  momentum: { value: 90, direction: "rising" },
}

const EMPTY_STATE: WatchlistState = { watchlist: [], activeId: null }
const SINGLE_STATE: WatchlistState = {
  watchlist: [MOCK_ENTRY_1],
  activeId: "m1",
}
const FULL_STATE: WatchlistState = {
  watchlist: [MOCK_ENTRY_1, MOCK_ENTRY_2, MOCK_ENTRY_3],
  activeId: "m1",
}

// ── Phase builder ─────────────────────────────────────────────────────────────

function buildPhase(
  phaseTag: BridgeProps["phaseTag"],
  watchlistSize: BridgeProps["watchlistSize"],
  isVideoTab: boolean,
  videoCount: number,
  errorMessage: string,
  showEditForm: boolean
): PopupPhase {
  const state =
    watchlistSize === 0
      ? EMPTY_STATE
      : watchlistSize === 1
        ? SINGLE_STATE
        : FULL_STATE

  switch (phaseTag) {
    case "LOADING":
      return { tag: "LOADING" }
    case "IDLE":
      return { tag: "IDLE", state, tabId: 1, isVideoTab, videoCount }
    case "SCRAPING":
      return { tag: "SCRAPING", state, tabId: 1 }
    case "FORM":
      return {
        tag: "FORM",
        state,
        tabId: 1,
        prefill: showEditForm ? { ...MOCK_ENTRY_1 } : {},
        editId: showEditForm ? MOCK_ENTRY_1.id : undefined,
      }
    case "SAVING":
      return { tag: "SAVING", state, tabId: 1 }
    case "ERROR":
      return { tag: "ERROR", message: errorMessage, prev: { tag: "LOADING" } }
  }
}

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts PopupRenderer with a mock FSM so every phase (LOADING → IDLE →
// FORM → SAVING → ERROR) can be inspected without the extension runtime.
//
// Storybook controls drive the phase. In-popup button clicks log to console
// via the mock FSM but do not advance the phase — use controls for that.

type BridgeProps = {
  phaseTag: "LOADING" | "IDLE" | "SCRAPING" | "FORM" | "SAVING" | "ERROR"
  /** Number of watchlist entries injected into the mock state */
  watchlistSize: 0 | 1 | 3
  /** Drives the video-platform banner in IDLE */
  isVideoTab: boolean
  /** Video frame count shown in the video banner */
  videoCount: number
  /** Error message displayed in the ERROR phase */
  errorMessage: string
  /** FORM phase: true pre-fills from MOCK_ENTRY_1 (edit flow) */
  showEditForm: boolean
}

const PopupRendererBridge = ({
  phaseTag,
  watchlistSize,
  isVideoTab,
  videoCount,
  errorMessage,
  showEditForm,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PopupRenderer | null>(null)
  const fsmRef = useRef(new MockFsm())

  // Mount once
  useEffect(() => {
    const container = containerRef.current
    if (!container || rendererRef.current) return

    rendererRef.current = new PopupRenderer(container, fsmRef.current)

    return () => {
      container.innerHTML = ""
      rendererRef.current = null
    }
  }, [])

  // Sync phase when controls change
  useEffect(() => {
    rendererRef.current?.render(
      buildPhase(
        phaseTag,
        watchlistSize,
        isVideoTab,
        videoCount,
        errorMessage,
        showEditForm
      )
    )
  }, [
    phaseTag,
    watchlistSize,
    isVideoTab,
    videoCount,
    errorMessage,
    showEditForm,
  ])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, hsl(220 30% 14%), hsl(240 25% 8%))",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.25)",
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        PopupRenderer — button clicks log to console · use controls to change
        phase
      </div>

      {/* Popup chrome shell — 340 px mirrors the real browser popup dimensions */}
      <div
        style={{
          width: 340,
          maxHeight: 600,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 12px 48px hsl(340 50% 10% / 0.5)",
        }}
      >
        <div
          id="popup-root"
          ref={containerRef}
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 200,
            maxHeight: 600,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.12)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: 11,
        }}
      >
        PopupRenderer — isolated from browser extension runtime
      </div>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/PopupRenderer",
  component: PopupRendererBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    phaseTag: {
      control: "select",
      options: [
        "LOADING",
        "IDLE",
        "SCRAPING",
        "FORM",
        "SAVING",
        "ERROR",
      ] satisfies Array<BridgeProps["phaseTag"]>,
      description: "Drives which phase PopupRenderer.render() receives",
    },
    watchlistSize: {
      control: "inline-radio",
      options: [0, 1, 3] satisfies Array<BridgeProps["watchlistSize"]>,
      description: "Number of mock entries injected into the IDLE / FORM state",
    },
    isVideoTab: {
      control: "boolean",
      description: "Shows the video-platform banner in IDLE",
    },
    videoCount: {
      control: { type: "range", min: 0, max: 5, step: 1 },
      description: "Media frames detected — shown in the video banner",
    },
    errorMessage: {
      control: "text",
      description: "Message displayed in the ERROR phase",
    },
    showEditForm: {
      control: "boolean",
      description:
        "FORM phase: pre-fill from mock entry (edit flow) vs blank (add flow)",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Loading — spinner shown while background state is being fetched. */
export const Loading: Story = {
  args: {
    phaseTag: "LOADING",
    watchlistSize: 0,
    isVideoTab: false,
    videoCount: 0,
    errorMessage: "Failed to connect to background service",
    showEditForm: false,
  },
}

/** Idle / empty — management view, no entries yet. */
export const IdleEmpty: Story = {
  name: "Idle / Empty",
  args: {
    ...Loading.args,
    phaseTag: "IDLE",
    watchlistSize: 0,
    isVideoTab: false,
  },
}

/** Idle / video tab — platform-detected banner + media frame count. */
export const IdleVideoTab: Story = {
  name: "Idle / Video Tab",
  args: {
    ...Loading.args,
    phaseTag: "IDLE",
    watchlistSize: 1,
    isVideoTab: true,
    videoCount: 2,
  },
}

/** Idle / with entries — watchlist shows 3 items, first active. */
export const IdleWithEntries: Story = {
  name: "Idle / With Entries",
  args: {
    ...Loading.args,
    phaseTag: "IDLE",
    watchlistSize: 3,
    isVideoTab: false,
  },
}

/** Scraping — "Reading tab…" spinner while the content script executes. */
export const Scraping: Story = {
  args: {
    ...Loading.args,
    phaseTag: "SCRAPING",
    watchlistSize: 1,
  },
}

/** Form / new — blank add flow; Facts tab active, title field required. */
export const FormNew: Story = {
  name: "Form / New Entry",
  args: {
    ...Loading.args,
    phaseTag: "FORM",
    watchlistSize: 1,
    showEditForm: false,
  },
}

/** Form / edit — pre-filled with Queen of Tears; Update button label. */
export const FormEdit: Story = {
  name: "Form / Edit Existing",
  args: {
    ...Loading.args,
    phaseTag: "FORM",
    watchlistSize: 1,
    showEditForm: true,
  },
}

/** Saving — "Saving…" spinner while UPSERT_ENTRY is in-flight. */
export const Saving: Story = {
  args: {
    ...Loading.args,
    phaseTag: "SAVING",
    watchlistSize: 1,
  },
}

/** Error — message + Retry button; verify text wraps cleanly. */
export const ErrorState: Story = {
  name: "Error",
  args: {
    ...Loading.args,
    phaseTag: "ERROR",
    errorMessage: "Failed to connect to background service worker",
  },
}

/** Error / long message — two-line wrapping behaviour. */
export const ErrorLongMessage: Story = {
  name: "Error / Long Message",
  args: {
    ...Loading.args,
    phaseTag: "ERROR",
    errorMessage:
      "TypeError: Cannot read properties of undefined (reading 'watchlist') at PopupStateMachine.boot",
  },
}
