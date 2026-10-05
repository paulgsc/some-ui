// Single source of truth for all shared types across the extension.
// No logic, no side effects — import freely from any module.

export type MoodType =
  | "joy"
  | "love"
  | "sadness"
  | "tension"
  | "cringe"
  | "neutral"

export type MomentTag =
  | "confession"
  | "handTouch"
  | "jealousy"
  | "misunderstanding"
  | "reveal"
  | "argument"
  | "reunion"
  | "goodbye"
  | "kiss"
  | "promise"
  | "sacrifice"
  | "betrayal"
  | "separation"
  | "rivalry"
  | "other"

export type CardSize = "min" | "compact" | "full"

export type CardState = {
  dramaTitle: string
  posterUrl: string | null
  episode: string
  timestamp: string
  progress: number
  overallProgress: number
  rating: number
  completionLikelihood: number
  activeMood: MoodType | null
  featuredQuote: string
  emotionLabel: string
  isPlaying: boolean

  axes: DramaEntryOpinionated["axes"]
  transition: DramaEntryOpinionated["transition"]
  tags: DramaEntryOpinionated["tags"]
  peakLine: DramaEntryOpinionated["peakLine"]
  momentum: DramaEntryOpinionated["momentum"]
}

export type CardEvents = {
  onMoodSelect: (mood: MoodType) => void
  /** A verdict was picked on the card (a star, a finish choice). */
  onVerdict: (field: VerdictField, change: VerdictChange) => void
  onSizeChange: (size: CardSize) => void
  onDragEnd: (x: number, y: number) => void
}

// ─── Structural: factual / scrapable metadata ─────────────────────────────────
type DramaEntryStructural = {
  title: string
  episode: string
  network: string
  year: string
  genre: string
  note: string
  color: string
  url: string // source URL — scrapable from window.location.href
  posterUrl: string | null
  timestamp: string
  progress: number
  isPlaying: boolean
}

// ─── Opinionated: ephemeral, feeling-at-the-moment values ────────────────────
export type DramaEntryOpinionated = {
  rating: number // 0–10
  completionLikelihood: number // 0–1
  activeMood: MoodType | null
  featuredQuote: string
  emotionLabel: string
  overallProgress: number // 0–1  (episodes watched / total, user-tracked)

  axes: {
    connection: number // -100..+100  (+= Connection, -= Separation)
    hope: number //       -100..+100  (+= Hope,       -= Despair)
    trust: number //      -100..+100  (+= Trust,      -= Betrayal)
    control: number //    -100..+100  (+= Control,    -= Helplessness)
  }
  transition: { before: string; after: string }
  tags: Array<MomentTag> // house idiom is Array<T>, not T[]
  peakLine: string // replaces/supplements featuredQuote
  momentum: {
    value: number // 0..100
    direction: "rising" | "steady" | "falling"
  }
}

// ─── Full entry ───────────────────────────────────────────────────────────────
export type DramaEntry = {
  id: string
  addedAt: number
} & DramaEntryStructural &
  DramaEntryOpinionated

export type WatchlistState = {
  watchlist: Array<DramaEntry>
  activeId: string | null
  // Sites the user marked as streaming sites ("viki.com"). Tabs on them are
  // source tabs — no card; every other tab shows the card. Empty by default.
  streamSites: Array<string>
}

export type ScrapedMeta = {
  title: string
  episode: string
  network: string
  url: string
  posterUrl: string | null
  timestamp: string
  progress: number
  isPlaying: boolean
  videoCount: number
}

export type PopupPhase =
  | { tag: "LOADING" }
  | {
      tag: "IDLE"
      state: WatchlistState
      tabId: number
      site: string // the active tab's site; "" when it is not a web page
      isStreamSite: boolean // the active tab's site is marked
      videoCount: number
    }
  | { tag: "SCRAPING"; state: WatchlistState; tabId: number }
  | {
      tag: "FORM"
      state: WatchlistState
      tabId: number
      prefill: Partial<DramaEntry>
      editId?: string
    }
  | { tag: "SAVING"; state: WatchlistState; tabId: number }
  | { tag: "ERROR"; message: string; prev: PopupPhase }

// ─── Runtime messages ─────────────────────────────────────────────────────────
// Popup/content → background requests. background.ts narrows `unknown` into
// this union at its one validation boundary; every sender goes through the
// typed `sendMsg` in effects/messaging.ts.
export type MessageBridge =
  | { type: "GET_STATE" }
  | { type: "UPSERT_ENTRY"; entry: Partial<DramaEntry> & { title: string } }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "REMOVE_ENTRY"; id: string }
  | { type: "LOG_BEAT"; mood: MoodType; playback: Playback | null }
  | { type: "GET_BEATS"; dramaId: string }
  | { type: "SET_STREAM_SITE"; site: string; streaming: boolean }
  | { type: "ADJUST_VERDICT"; field: VerdictField; change: VerdictChange }
  | { type: "GET_VERDICTS"; dramaId: string }
  // The sender tab's card toggle (Alt+Shift+D). Per tab, keyed by the
  // sender's tab id, so it outlives the page: a navigation in a tab where the
  // card was hidden keeps it hidden until it is toggled back on.
  | { type: "GET_CARD_HIDDEN" }
  | { type: "SET_CARD_HIDDEN"; hidden: boolean }
  // A source tab's video changed state; the background re-elects the source
  // and broadcasts LIVE_PLAYBACK. Carries nothing: the background asks every
  // source tab fresh, as it does for a beat.
  | { type: "PLAYBACK_CHANGED" }
  // A display tab's first look at where the drama is (LIVE_PLAYBACK after).
  | { type: "GET_LIVE_PLAYBACK" }

// Wire envelope — what background.ts actually sends back for each message type.
// `ok: false` is uniform across all variants (error path), so it's factored out.
type Envelope<T> = ({ ok: true } & T) | { ok: false; error: string }

export type MessageResponseMap = {
  GET_STATE: Envelope<{ state: WatchlistState }>
  UPSERT_ENTRY: Envelope<{ state: WatchlistState }>
  SET_ACTIVE: Envelope<{ state: WatchlistState }>
  REMOVE_ENTRY: Envelope<{ state: WatchlistState }>
  LOG_BEAT: Envelope<{ beat: BeatRecord }>
  // The drama's most recent episode (by its latest beat) and that episode's beats.
  GET_BEATS: Envelope<{ episode: string; beats: Array<BeatRecord> }>
  SET_STREAM_SITE: Envelope<{ state: WatchlistState }>
  ADJUST_VERDICT: Envelope<{ state: WatchlistState }>
  // Every logged verdict change of one drama, oldest first.
  GET_VERDICTS: Envelope<{ verdicts: Array<VerdictRecord> }>
  GET_CARD_HIDDEN: Envelope<{ hidden: boolean }>
  SET_CARD_HIDDEN: Envelope<object>
  PLAYBACK_CHANGED: Envelope<object>
  GET_LIVE_PLAYBACK: Envelope<{ live: SourceReport | null }>
}

/** Background → content-script broadcast after every watchlist mutation. */
export type StateUpdateMessage = {
  type: "STATE_UPDATE"
  payload: WatchlistState
}

/** Background → display tabs, the instant a beat is logged or escalated. */
export type BeatLoggedMessage = {
  type: "BEAT_LOGGED"
  beat: BeatRecord
}

/**
 * Background → every tab on a marked site: "where is your video right now?"
 * A source tab answers with a SourceReport; any other tab doesn't answer.
 */
export type GetPlaybackMessage = { type: "GET_PLAYBACK" }

/** A source tab's answer to GET_PLAYBACK; logic/source.ts picks among them. */
export type SourceReport = {
  playback: Playback
  playing: boolean // a video on the page is playing right now
  lastPlayAt: number // epoch ms of the page's last `play`; 0 if none yet
  // Enough for a display to run the clock on without asking again
  // (logic/playback.ts): whether the time is moving right now (playing and
  // not stalled buffering), how fast, and when `playback` was read.
  advancing: boolean
  rate: number // playbackRate
  readAt: number // epoch ms
}

/**
 * Background → every tab: the drama's playback changed (a play, pause, seek,
 * rate change, a new source tab, or the source tab going away). The elected
 * source's report, or null when no source tab has a video.
 */
export type LivePlaybackMessage = {
  type: "LIVE_PLAYBACK"
  live: SourceReport | null
}

// ─── Beats: the live emotional log ────────────────────────────────────────────
// A beat is one reaction while watching: a mood, how hard it hit, and where in
// the episode it happened. Pressing the same mood again within a couple of
// seconds escalates the beat instead of logging a second one (logic/beats.ts).

export type Intensity = 1 | 2 | 3

/** What the source tab (the one playing the drama) reports about playback. */
export type Playback = {
  videoTime: number // seconds into the episode
  duration: number | null // seconds; null while the video has no metadata
  episode: string // parsed from the source page title, "" when absent
}

export type BeatRecord = {
  id: string
  dramaId: string
  dramaTitle: string
  episode: string
  mood: MoodType
  intensity: Intensity
  videoTime: number | null // null when no source tab could be reached
  duration: number | null
  capturedAt: number // first press
  updatedAt: number // latest press; the escalation window runs from here
}

// ─── Verdicts: rating and likelihood to finish ────────────────────────────────
// The two running judgements of the active drama, changed as quickly as a beat
// is logged: a hotkey steps one a notch, a star or a finish choice on the card
// sets it (logic/verdict.ts owns the ranges and the steps).

export type VerdictField = "rating" | "completionLikelihood"

export type VerdictChange = { set: number } | { step: 1 | -1 }

/**
 * One change of a verdict, kept for longitudinal tracking: what it was, what
 * it became, and where in the drama that happened. Quick repeated steps of the
 * same verdict fold into one record (logic/verdict-log.ts), so "7 → 9" is one
 * change, not four half-point presses.
 */
export type VerdictRecord = {
  id: string
  dramaId: string
  dramaTitle: string
  episode: string
  field: VerdictField
  from: number | null // null: the first value the drama was given
  to: number
  videoTime: number | null // null outside playback (popup edits, no source)
  at: number // latest change; the folding window runs from here
}

// ─── Spotlight: the latest change, shown first ────────────────────────────────
// For a few seconds after a mood, rating or finish change, the card shows that
// change instead of its usual face (logic/content/spotlight.ts).

export type Spotlight =
  | {
      kind: "mood"
      mood: MoodType
      intensity: Intensity
      videoTime: number | null
    }
  | { kind: "rating"; value: number; delta: number }
  | { kind: "finish"; value: number; delta: number }
