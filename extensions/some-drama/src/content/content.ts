// Injected into every tab. Each tab plays one of two roles (the some-mujik
// pattern), and the role follows the user's list of streaming sites — it is
// re-resolved on every STATE_UPDATE, so marking or unmarking a site in the
// popup flips open tabs without a reload:
//
//   DISPLAY — the default, every tab. Renders the card from the active entry;
//             this is the page OBS captures. Hotkeys and the mood pickers log
//             beats (the background asks the source tab for the video time),
//             and every BEAT_LOGGED pulses the live strip.
//   SOURCE  — a tab on a site the user marked as a streaming site: where the
//             drama plays. Renders no card (the drama is never on stream).
//             Registers itself with the background, answers GET_PLAYBACK, and
//             logs beats from hotkeys with its own video time.
//
// Display responsibilities:
//   1. Render DramaCard from the active entry — all fields real, no dummies.
//   2. React to STATE_UPDATE broadcasts from background.
//   3. Persist card position/size locally.
//   4. Load the episode's beats (GET_BEATS); pulse the live strip on each
//      BEAT_LOGGED.
//   5. Verdict commands (Alt+Shift+= / - rating, ] / [ likelihood to finish)
//      step the active drama's verdicts from any tab; the STATE_UPDATE echo
//      spotlights the change on every display tab.
//   6. `toggle-visibility` command (Alt+Shift+D, bound via the commons
//      keybinding typestate) — toggle card visibility, or refetch state if
//      there is no card (background was evicted on page load).
//
// Display typestate:
//   LOADING — awaiting first state
//   EMPTY   — no active entry in watchlist
//   READY   — active entry present, card rendered
//
// Bug fixes (see git log):
//   BUG-1  broadcastState skips video tabs, so content.ts never receives
//          STATE_UPDATE on Netflix/YouTube after SET_ACTIVE. Fixed in
//          background.ts by broadcasting to ALL tabs and letting content.ts
//          guard itself.
//   BUG-2  GET_STATE races with background wake-up when the non-persistent
//          background script is evicted. Fixed by refresh() with a single
//          300 ms retry on failure.
//   BUG-3  Keybinding was a no-op when card === null (EMPTY typestate after
//          a failed init). Fixed: toggle-visibility refetches state when no
//          card exists instead of silently doing nothing.
//   BUG-4  GET_STATE resolves to the `{ ok, state }` envelope, but the reply
//          was read as a bare WatchlistState — so `watchlist` was always
//          undefined and the card never rendered on page load, only after a
//          popup mutation broadcast STATE_UPDATE. Fixed: requests go through
//          the typed sendMsg and the envelope is unwrapped.

import { readPlayback } from "@drama/effects/content/playback"
import { sendMsg } from "@drama/effects/messaging"
import { KEY_BINDINGS } from "@drama/logic/content/commands"
import type { DramaCommandId } from "@drama/logic/content/commands"
import { MOODS } from "@drama/logic/content/constants"
import { isStreamSite } from "@drama/logic/stream-sites"
import type {
  BeatLoggedMessage,
  GetPlaybackMessage,
  Playback,
  StateUpdateMessage,
  WatchlistState,
} from "@drama/types"
import { attachKeyBindings, isRecord } from "@some-extension/common"
import type { CommandRegistry } from "@some-extension/common"

import {
  adjustVerdict,
  createDisplay,
  loadCardMeta,
  log,
  logBeat,
} from "./display"
import type { Display, PersistedCardMeta } from "./display"

// ─── Message guards ───────────────────────────────────────────────────────────

function isBeatLoggedMessage(v: unknown): v is BeatLoggedMessage {
  return isRecord(v) && v.type === "BEAT_LOGGED" && isRecord(v.beat)
}

function isGetPlaybackMessage(v: unknown): v is GetPlaybackMessage {
  return isRecord(v) && v.type === "GET_PLAYBACK"
}

function isStateUpdateMessage(v: unknown): v is StateUpdateMessage {
  return isRecord(v) && v.type === "STATE_UPDATE" && isRecord(v.payload)
}

// ─── Beats ─────────────────────────────────────────────────────────────────────

/** One `beat:<mood>` command per mood, each reading playback at press time. */
function beatCommands(
  playback: () => Playback | null
): CommandRegistry<DramaCommandId> {
  return Object.fromEntries(
    MOODS.map((m) => [
      `beat:${m.type}`,
      (): void => logBeat(m.type, playback()),
    ])
  )
}

// ─── Controller ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let role: "source" | "display" | null = null
  let display: Display | null = null
  let cardMeta: PersistedCardMeta | null = await loadCardMeta()

  const registerSource = (): void => {
    sendMsg({ type: "REGISTER_SOURCE" }).catch((err: unknown) =>
      log.error("REGISTER_SOURCE failed:", err)
    )
  }

  /** Resolve this tab's role from the latest state, then hand state on. */
  const apply = (state: WatchlistState): void => {
    const next = isStreamSite(location.href, state.streamSites)
      ? "source"
      : "display"

    if (next !== role) {
      display?.destroy()
      display = null
      role = next
      if (next === "source") {
        log.info("Streaming site — no card; beats carry this tab's video time.")
        registerSource()
      } else {
        display = createDisplay({
          cardMeta,
          onCardMeta: (meta) => {
            cardMeta = meta
          },
          refetch: () => void refresh(),
        })
      }
    }

    display?.apply(state)
  }

  // GET_STATE, retried once after 300 ms for the race where the
  // non-persistent background script is still waking up.
  const refresh = async (retryOnFailure = true): Promise<void> => {
    try {
      const resp = await sendMsg({ type: "GET_STATE" })
      if (!resp.ok) throw new Error(resp.error)
      apply(resp.state)
    } catch (err) {
      log.error("GET_STATE failed:", err)
      if (retryOnFailure) {
        await new Promise((r) => setTimeout(r, 300))
        return refresh(false)
      }
      // Both attempts failed — fall back to an empty display so the page
      // isn't stuck on LOADING.
      if (role === null)
        apply({ watchlist: [], activeId: null, streamSites: [] })
    }
  }

  // ── Background messages ───────────────────────────────────────────────────

  browser.runtime.onMessage.addListener(
    (msg: unknown): Promise<Playback | null> | undefined => {
      if (isGetPlaybackMessage(msg)) {
        return role === "source" ? Promise.resolve(readPlayback()) : undefined
      }
      if (isBeatLoggedMessage(msg)) display?.onBeat(msg.beat)
      else if (isStateUpdateMessage(msg)) apply(msg.payload)
      return undefined
    }
  )

  // Media events don't bubble; capture them at the document. Whichever
  // streaming tab last started playing is the source (two tabs on marked
  // sites: the one playing).
  // Lifetime: the page's. It is the content script's own entry point, which
  // lives exactly as long as the document; it does nothing unless the role is
  // "source", and the role follows every STATE_UPDATE.
  // eslint-disable-next-line extension-charter/require-scoped-lifetime -- page-lifetime by design; see above
  document.addEventListener(
    "play",
    () => {
      if (role === "source") registerSource()
    },
    { capture: true }
  )

  // ── Keybindings ───────────────────────────────────────────────────────────
  // Attached once for the page's lifetime; each handler reads the current
  // role, so a role flip needs no re-binding.

  const commands: CommandRegistry<DramaCommandId> = {
    // A display tab has no video of its own; the background asks the source.
    ...beatCommands(() => (role === "source" ? readPlayback() : null)),
    "rating:up": (): void => adjustVerdict("rating", { step: 1 }),
    "rating:down": (): void => adjustVerdict("rating", { step: -1 }),
    "finish:up": (): void => adjustVerdict("completionLikelihood", { step: 1 }),
    "finish:down": (): void =>
      adjustVerdict("completionLikelihood", { step: -1 }),
    "toggle-visibility": (): void => {
      if (display) display.toggleVisibility()
      else if (role === null) void refresh()
    },
  }
  attachKeyBindings(commands, KEY_BINDINGS)

  await refresh()
  log.info("Ready.", { role })
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void main(), {
    once: true,
  })
} else {
  void main()
}
