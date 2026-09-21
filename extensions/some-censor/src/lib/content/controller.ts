/**
 * Controller — the content script's lifecycle shell (BC5, #1438).
 *
 * What is left once the Sensor owns observation and navigation, Core owns
 * every decision and the Actuator owns every write: starting the recording,
 * waiting for `ytd-app`, answering the background's enable/disable and
 * whitelist broadcasts, and the keybindings. Invariants C1 (idempotent
 * start) and C3 (a second start is a no-op, not duplicate state) are the
 * runtime's; C2 (navigation is a full teardown of every card) is Core's R3,
 * answering the `nav` token the Sensor emits after its C4 debounce.
 */

import { ext } from "@censor/platform/content"
import { asChannelId } from "@censor/types/ids"
import type { KeyBindingDisposer } from "@some-extension/common"

import { attachKeyBindings } from "./commands"
import { startObservability } from "./observability"
import type { Runtime } from "./runtime/runtime"
import { createRuntime } from "./runtime/runtime"

export class Controller {
  private readonly _runtime: Runtime
  private _appWaiter: MutationObserver | null = null
  private _disposeKeyBindings: KeyBindingDisposer | null = null

  constructor(runtime?: Runtime) {
    this._runtime = runtime ?? createRuntime({ doc: document, win: window })
  }

  init(): void {
    // One recording per content-script instance, started before anything can
    // record into it and deliberately *not* restarted per session — see
    // observability.ts's header for why that scope is the right one.
    startObservability()
    this._listenBroadcasts()
    this._bootstrap()
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  private _bootstrap(): void {
    ext.runtime
      .sendMessage({ type: "GET_ENABLED" })
      .then((r: unknown) => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const resp = r as { ok?: boolean; enabled?: boolean } | null
        const enabled =
          resp?.ok === true && typeof resp.enabled === "boolean"
            ? resp.enabled
            : true
        if (enabled) this._waitForApp()
      })
      .catch(() => {
        // Degraded: proceed as enabled (safe default)
        this._waitForApp()
      })
  }

  private _start(): void {
    if (this._runtime.running) return
    this._runtime.start()
    this._disposeKeyBindings = attachKeyBindings((command) =>
      this._runtime.dispatch({ kind: "command", command, t: Date.now() })
    )
  }

  private _stop(): void {
    this._disposeKeyBindings?.()
    this._disposeKeyBindings = null
    this._runtime.stop()
  }

  // ── DOM bootstrap ─────────────────────────────────────────────────────────

  private _waitForApp(): void {
    if (document.querySelector("ytd-app")) {
      this._start()
      return
    }
    this._appWaiter = new MutationObserver(() => {
      if (document.querySelector("ytd-app")) {
        this._appWaiter?.disconnect()
        this._appWaiter = null
        this._start()
      }
    })
    this._appWaiter.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  // ── Background messages ───────────────────────────────────────────────────

  private _listenBroadcasts(): void {
    ext.runtime.onMessage.addListener((msg: unknown) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const m = msg as { type?: string; enabled?: boolean; channelId?: string }
      const { type: t } = m
      // eslint-disable-next-line switch-lint/require-fail-fast-default
      switch (t) {
        case "ENABLED_CHANGED": {
          if (m.enabled) this._start()
          else this._stop()
          break
        }
        case "CHANNEL_WHITELISTED": {
          if (m.channelId !== undefined) {
            this._runtime.dispatch({
              kind: "whitelist-broadcast",
              channelId: asChannelId(m.channelId),
              t: Date.now(),
            })
          }
          break
        }
      }
    })
  }
}
