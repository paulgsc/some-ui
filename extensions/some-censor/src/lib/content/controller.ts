/**
 * Controller — the content script's lifecycle shell (BC5, #1438).
 *
 * What is left once the Sensor owns observation and navigation, Core owns
 * every decision and the Actuator owns every write: starting the recording,
 * waiting for `ytd-app`, and following the owner's settings (`lib/settings`,
 * #1807).
 *
 * Lifecycle properties, labelled here because they are cited elsewhere;
 * pinned by `runtime/runtime.test.ts`, not declared review invariants:
 *
 *   C1 — Start is idempotent. `_start()` returns while the runtime is
 *        running, and `Runtime.start()` returns while Core's phase is
 *        `running`.
 *   C2 — Navigation is a full teardown. Core answers the Sensor's `nav`
 *        token by unmounting and forgetting every card and adopting the new
 *        session (R3). Chip and feed swaps reuse elements in place, so
 *        anything less would leave their old views showing.
 *   C3 — A second start is a no-op, not duplicate state: one Sensor, one
 *        Actuator.
 *   C4 — Navigation is debounced. The Sensor coalesces a burst of
 *        `yt-navigate-finish` into one `nav` (`NAV_DEBOUNCE_MS`).
 */

import type { Settings } from "@censor/lib/settings/settings"
import { boundaryDays, followSettings } from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/content"

import { setSwitchedOff } from "./actuator/index"
import { startObservability } from "./observability"
import type { Runtime } from "./runtime/runtime"
import { createRuntime } from "./runtime/runtime"

export class Controller {
  private readonly _runtime: Runtime
  private _appWaiter: MutationObserver | null = null

  constructor(runtime?: Runtime) {
    this._runtime = runtime ?? createRuntime({ doc: document, win: window })
  }

  init(): void {
    // One recording per content-script instance, started before anything can
    // record into it and deliberately *not* restarted per session — see
    // observability.ts's header for why that scope is the right one.
    startObservability()
    followSettings(ext.storage, (settings) => this._apply(settings))
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  /** Off stops the runtime and lifts the pre-mask, in one task. */
  private _apply(settings: Settings): void {
    this._runtime.setBoundary(boundaryDays(settings.boundary))
    if (settings.enabled) {
      setSwitchedOff(document, false)
      this._waitForApp()
    } else {
      this._stop()
      setSwitchedOff(document, true)
    }
  }

  private _start(): void {
    if (this._runtime.running) return
    this._runtime.start()
  }

  private _stop(): void {
    this._appWaiter?.disconnect()
    this._appWaiter = null
    this._runtime.stop()
  }

  // ── DOM bootstrap ─────────────────────────────────────────────────────────

  private _waitForApp(): void {
    if (this._appWaiter !== null) return
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
}
