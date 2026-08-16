# Suspender Ledger — Design Notes

> **Beta.** The core auto-suspension path (time-based → native
> `chrome.tabs.discard()`) is functional. The gaps and footguns below are
> things to be aware of before signing for public AMO listing. See the
> paired acceptance-checklist issue for the gate criteria.

---

## Inherited decisions from auto-tab-discard

These exist because the upstream (auto-tab-discard v3) did them, not because
they were designed fresh for this project. Know them before debugging
surprising behaviour.

### `number` threshold is a floor, not a budget

`prefs.number` (default **6**) is the minimum number of _eligible_ background
tabs that must be open before auto-discard fires at all. Nothing is suspended
unless at least `N + 1` eligible tabs exist. With the default, you need 7+
background tabs. This surprises users expecting it to mean "keep at most N
tabs loaded."

### `icon-update` inverts evaluation order

When `prefs["icon-update"]` is `false` (default), the tab-count check happens
_before_ metadata is collected — tabs are rejected early and
`executeScript` is never called for any tab. When `true`, metadata is
collected for _all_ tabs first (to populate per-tab toolbar icons), then the
count check re-runs. The inversion is intentional (icon accuracy vs. CPU cost)
but counter-intuitive when reading `number.check` top-to-bottom.

### Battery gate is a no-op

`prefs.battery` appears in the settings UI and is stored, but the Battery
Status API is deprecated and absent from Firefox. The guard was not ported. The
preference persists harmlessly; if you ever restore it, `navigator.getBattery()`
is async — it cannot be read inline.

### `tmp_disable` stores hours, not seconds

`prefs.tmp_disable` is a number of _hours_. The alarm is set to
`value × 60 × 60 × 1000` ms. Do not confuse it with `period`, which is in
_seconds_.

### `url-based` mode is lightly tested

The extension supports `time-based` (default) and `url-based` (only suspend
tabs matching the whitelist). The `url-based` branch through `number.check` was
ported but is not part of the primary user story or acceptance testing.

### `whitelist.session` is not persisted across browser restarts

Session-storage whitelisted domains vanish when the browser closes. There is no
sync from `whitelist.session` → `whitelist` on session end. Users must
re-add them manually, or use the permanent whitelist instead.

---

## Browser API footguns

### Service worker can be killed at any time

Firefox MV3 service workers are event-driven and may be terminated after
~30 s of inactivity. In-memory state reset on restart:

| State                | Consequence if worker restarts mid-operation       |
| -------------------- | -------------------------------------------------- |
| `inprogress` Set     | 2 s dedup window lost → duplicate suspend possible |
| `discard.count`      | Concurrency counter reset → may over-schedule      |
| `discard.tabs` queue | Queued-but-unstarted suspensions silently lost     |

The `chrome.alarms` wake-up mechanism survives worker termination — periodic
checks keep working. But anything held only in module-scope memory is
ephemeral.

### `executeScript` with `func:` must be fully self-contained

`collectMeta()` is serialised by Firefox via `Function.prototype.toString()`
and re-parsed in the content script context. Rules:

- **No closure captures.** Any non-global referenced inside the function body
  must be a browser built-in (`document`, `window`, `Notification`, `Array`,
  etc.). Module-scope imports are not available at call time.
- **No value-level module references.** TypeScript types are erased (fine);
  actual imported values are not serialised and will be `undefined` at runtime.
- **Self-contained helpers.** If you split the collector into helpers, either
  inline them into the function body or inject them as separate `func:` calls
  first.

Violations fail silently — `executeScript` resolves with `undefined` results
rather than rejecting. The tab is skipped as "not ready."

### `allFrames: true` and the frame-0 time fix

`executeScript({ allFrames: true })` returns one result per frame. Child
iframes lack the `watch.ts` injection, so they return `time: Date.now()`. The
naive `Object.assign({}, ...ms)` merge (last-write-wins) would overwrite the
main frame's meaningful `lastVisit` with the iframe's fresh timestamp, making
every multi-frame tab look "too young." The explicit `results.find(r => r.frameId === 0)`
restore in `number.ts` fixes this. **Do not remove it.**

### `tab.lastAccessed` is focus time, not idle time

`tab.lastAccessed` (Firefox/Chrome) records when the user last _activated_ the
tab. It has no minimum dwell threshold — a 200 ms cmd+tab resets it. For tabs
with `watch.ts` injected, `window.lastVisit` (set on `visibilitychange`) is
used instead and better reflects attention. `lastAccessed` is the fallback for
pre-existing tabs that missed content-script injection.

### `tabs.query({ audible: false })` is coarser than it looks

This removes tabs the browser reports as _currently producing audio_. A tab
with a paused video, a muted video, or a video that just finished is **not**
audible and passes the query filter. The separate `prefs.paused` guard (via
`collectMeta`'s media scan) catches paused players. A tab playing silent
autoplay video slips past both.

### Chrome alarm granularity

Firefox enforces a minimum alarm period of 1 minute. `number.install(period)`
sets the interval to `period / 3`, clamped to 1–20 min. For the default
10-minute period, checks fire roughly every 3–4 minutes. Alarm timing is
advisory — the browser may delay delivery under load or after machine sleep.
The `idle.onStateChanged` listener reschedules stale alarms on wake.

### `watch.ts` and `collectMeta` must share the same world

`watch.ts` sets `window.lastVisit` and `window.isReceivingFormInput` in the
extension's _isolated_ world. `collectMeta` is injected into the same isolated
world (default `world: "ISOLATED"`). Changing either to `world: "MAIN"` breaks
the link — the properties become invisible across the world boundary and the
collector falls back to `undefined`/`Date.now()`.

### "No tab to switch to" is not an audio/video bug

When the user suspends the active tab via the popup and there are no other
non-suspended, non-highlighted tabs in the window, `onClicked` shows a
notification and does nothing. This is intentional — the browser cannot be
left with no focused tab. It appears as a silent failure when the user has only
one non-suspended tab open. It is **not** related to audio or video guards; the
`discard-tab` path never checks audibility.

---

## Known gaps

| Area                               | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Severity                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Worker queue durability            | `discard.tabs` concurrency queue is in-memory; lost on worker restart. No storage-backed queue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Low — only affects bulk-suspend scenarios where the worker dies mid-flight |
| Battery guard                      | `prefs.battery` stored but not checked; API deprecated in Firefox.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Cosmetic — preference appears in UI but has no effect                      |
| Memory pressure reporting          | `prefs["memory-enabled"]` path reads `window.performance.memory` via `collectMeta`, but that is a Chrome-only non-standard API. Firefox returns `undefined`. Memory-based forced discard silently never fires.                                                                                                                                                                                                                                                                                                                                                        | Low for Firefox-only beta                                                  |
| `open-tab-then-discard`            | Uses `browser.tabs.create({ discarded: true })`, Firefox-only. No Chrome fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | N/A for Firefox-only beta                                                  |
| `url-based` mode coverage          | Second discard mode present but not acceptance-tested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Deferred                                                                   |
| "Kept awake" staleness             | `discard-state.ts`'s badge/banner entry for a tab is cleared on any `onUpdated` event reporting `discarded: true` (covers this extension's own success, native memory-pressure discarding, and other extensions), on tab close, or on the next refused attempt. If the user resolves the cause manually (submits the form, stops the audio) without any of those firing, the badge can overstate reality for up to one check interval (~3–20 min). No push signal exists for "the veto condition just cleared."                                                       | Cosmetic — self-heals on the next sweep, discard, or tab close             |
| `hydrateDiscardState` merge window | Restoring from `storage.session` merges rather than replaces (a concurrent `markSkipped`/`clearSkipped` always wins over the restored snapshot), which closes the dominant clobber case. One narrow window remains: a `clearSkipped` for a tab that also has a _stale_ entry in the snapshot, landing between the read starting and resolving, can still be re-added by the restore. Discard's own confirm/retry delays (≥250 ms) make this far slower than a typical storage read, so it is unlikely to manifest; the same staleness self-heal covers it if it does. | Cosmetic — narrow window, self-heals                                       |
