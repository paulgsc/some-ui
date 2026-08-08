/**
 * The judgment half of the census — hand-authored, and validated against
 * `walk.mjs`'s mechanical output rather than typed independently of it.
 *
 * Two maps:
 *
 * - `ROWS`: one entry per *intent* — the unit a person would recognise
 *   ("click Save & Play"), which can be made up of several AST call sites
 *   (a composite chain) or exactly one. Carries the S1 columns (gesture,
 *   effect, what's rendered) and the S2 columns (presentation,
 *   cancellable) together, because #940 extends #938's table rather than
 *   replacing it.
 * - `SITE_ANNOTATIONS`: one entry per call site `walk.mjs` can find,
 *   pointing at the `ROWS` entry it belongs to — or, for a site that is
 *   implementation plumbing rather than a decision point of its own,
 *   `row: null` with a `group` explaining why.
 *
 * `generate.mjs` cross-checks both directions: every site the walker finds
 * must appear here (an uncovered call site fails the build, loudly, rather
 * than silently missing the table), and every site named here must still
 * exist in the walk (a stale entry — the code moved or was deleted — fails
 * the same way). That symmetry is what "derived, not hand-maintained" means
 * in practice: the *judgment* is hand-written, but it cannot silently drift
 * from the *code* it is judgment about.
 */

/** @typedef {{
 *   table: "gesture" | "ambient",
 *   gesture: string,
 *   effect: string,
 *   renders: { working: string, succeeded: string, failed: string },
 *   presentation: "interactive" | "ambient",
 *   justification?: string,
 *   cancellable: boolean,
 *   cancelNote: string,
 * }} CensusRow */

/** @type {Record<string, CensusRow>} */
export const ROWS = {
  "composer-save-draft": {
    table: "gesture",
    gesture: 'Composer: click "Save as draft"',
    effect:
      "createSession.mutate (new) or updateSession.mutate (editing an existing draft)",
    renders: {
      working:
        "Both step-4 buttons disable (`isSaving`); no spinner, no text change.",
      succeeded:
        'toast("Session saved as draft" / "Draft updated"), then navigate to /sessions.',
      failed:
        "Nothing. The promise rejects, `onSuccess` never runs, the buttons re-enable, and the person is looking at exactly the screen they were looking at before they clicked.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "Single request against a 150ms mock or a LAN file_host; nothing in the app has ever taken long enough for a cancel affordance to matter.",
  },
  "composer-save-and-play": {
    table: "gesture",
    gesture: 'Composer: click "Save & Play"',
    effect:
      "Editing: updateSession.mutate, onSuccess navigates to the player. " +
      "New session (the #933 flow): createSession.mutate, whose onSuccess " +
      "chains updateSession.mutate (status → active), whose onSuccess " +
      "navigates. One gesture, up to two network round-trips, three nested " +
      "failure edges (create, the chained update, and the navigate that " +
      "only the chain's success reaches).",
    renders: {
      working:
        "Both buttons disable (`isSaving`); no spinner, no step-by-step progress through the chain.",
      succeeded:
        "navigate to /sessions/$sessionId. No toast — arriving at the player is the confirmation.",
      failed:
        "Nothing, at every edge. A failure in the chained update leaves a session that was successfully created but never marked active, sitting in Drafts with no record anywhere that Save & Play was even clicked.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "Same latency profile as save-draft. The chain's two round-trips together are still well under a second against either backend in normal operation.",
  },
  "completion-summary-replay": {
    table: "gesture",
    gesture: 'Completion screen: click "Play again"',
    effect:
      "duplicateSession.mutate, onSuccess navigates to the composer with the copy.",
    renders: {
      working: "Button disables (`isPending`); icon and label stay put.",
      succeeded: "navigate to /sessions/new?edit=<copyId>.",
      failed:
        "Nothing. Button re-enables; the person is still looking at the completion screen with no explanation.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote: "Single request, same profile as every other session write.",
  },
  "profile-save": {
    table: "gesture",
    gesture: 'Profile page: click "Save changes"',
    effect: "updateProfile.mutate.",
    renders: {
      working: 'Button disables and its label swaps to "Saving...".',
      succeeded: 'toast("Profile saved").',
      failed:
        'Nothing. Label reverts to "Save changes"; the draft the person typed is still on screen, still unsaved, with no indication it needs re-submitting.',
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "Single request against the settings repository; same profile as profile/settings saves generally.",
  },
  "settings-save": {
    table: "gesture",
    gesture: 'Settings page: click "Save changes"',
    effect: "updateSettings.mutate.",
    renders: {
      working: 'Button disables and its label swaps to "Saving...".',
      succeeded: 'toast("Settings saved").',
      failed:
        "Nothing. Same shape as profile-save — indistinguishable from success until the person reopens the page and finds their change gone.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "Single request, same profile as every other settings/profile save.",
  },
  "sessions-duplicate": {
    table: "gesture",
    gesture: "Sessions list: click the duplicate icon on a card",
    effect: "duplicateSession.mutate.",
    renders: {
      working: "Icon button disables; no spinner.",
      succeeded:
        "List refetches (invalidateQueries) and the copy appears in Drafts. No toast.",
      failed:
        "Nothing. Button re-enables; nothing distinguishes this from a duplicate that quietly did nothing.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "Single request, same profile as the rest of the session CRUD surface.",
  },
  "sessions-delete": {
    table: "gesture",
    gesture:
      "Sessions list: click the delete icon on a card, confirm the native dialog",
    effect: "window.confirm(...), then deleteSession.mutate.",
    renders: {
      working: "Icon button disables after the confirm; no spinner.",
      succeeded: "List refetches; the row disappears. No toast.",
      failed:
        "Nothing. The row the person just confirmed deleting is still there — silently, since a page that showed nothing changed reads as 'it worked' rather than 'it failed', which is the opposite of the truth here.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "Single request; the confirm() dialog is itself the only synchronous pause in this flow.",
  },
  "sessions-bulk-delete": {
    table: "gesture",
    gesture:
      'Sessions list: select rows, click "Delete" in the bulk bar, confirm',
    effect: "window.confirm(...), then deleteMany.mutate(ids).",
    renders: {
      working:
        "The whole bulk toolbar disables (`isBusy`); no per-row feedback, no count of how many are in flight.",
      succeeded: "Selection clears, list refetches.",
      failed:
        "Nothing. #939's open question — what happens to the other rows when one fails — cannot even be asked yet: `removeMany` is one request for the whole batch, so it is all-or-nothing at the transport level, and either way the toolbar just goes back to normal with the selection still checked.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "Bounded by however many ids are selected in one request; nothing observed in this app approaches a duration where cancelling mid-flight would mean anything.",
  },
  "sessions-bulk-status": {
    table: "gesture",
    gesture: "Sessions list: select rows, choose a status in the bulk bar",
    effect: "updateStatusMany.mutate({ ids, status }).",
    renders: {
      working: "Bulk toolbar disables (`isBusy`).",
      succeeded: "Selection clears, list refetches.",
      failed: "Nothing, same shape as sessions-bulk-delete.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote: "Same as sessions-bulk-delete.",
  },
  "nudge-toggle": {
    table: "gesture",
    gesture: 'Settings: flip the "Study reminders" switch',
    effect:
      "Off → unsubscribeFromPush(). On → requestNudgePermission(), then " +
      "registerNudgeWorker(), then (server mode) subscribeToPush({ topics }).",
    renders: {
      working:
        "No pending indicator on the switch itself while the chain runs.",
      succeeded:
        'The switch state (optimistic, via onChange). If subscribeToPush degrades rather than fully succeeds, a toast names the degraded mode ("Reminders are on, but only while a tab is open" — quoting which of not-configured/unreachable it was).',
      failed:
        'toast("Reminders need notification permission", ...) naming denied vs dismissed. The one mutation-adjacent flow in the app that already does this — see the classification note below.',
    },
    presentation: "interactive",
    justification:
      "N/A for this row (interactive) — flagged here anyway because it is the app's own positive counter-example: proof the discipline this epic is measuring the absence of is already applied, once, in one place.",
    cancellable: false,
    cancelNote:
      "Permission prompt and a couple of short requests; nothing to cancel mid-flight.",
  },
  "nudge-send-test": {
    table: "gesture",
    gesture: 'Settings: click "Send a test" (under Study reminders)',
    effect:
      "showNudge({...}) — a real registration.showNotification(...) call.",
    renders: {
      working: "No pending state on the button.",
      succeeded:
        "A real OS/browser notification appears. No in-app toast — the notification is the confirmation.",
      failed:
        'toast("Could not show a notification - check permission."). #938\'s named positive case.',
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote:
      "A single, effectively synchronous call to a local browser API.",
  },
  "nudge-topic-checkbox": {
    table: "gesture",
    gesture: "Settings: tick/untick an individual push topic checkbox",
    effect:
      "void subscribeToPush({ topics: next }) — fired, outcome discarded.",
    renders: {
      working: "None.",
      succeeded: "None beyond the checkbox's own optimistic state.",
      failed:
        "Nothing. Unlike nudge-toggle's use of the same subscribeToPush, this call site does not read the PushSubscribeOutcome it gets back at all — the checkbox can end up disagreeing with what the server actually holds, silently.",
    },
    presentation: "interactive",
    cancellable: false,
    cancelNote: "Single request.",
  },

  // ── Ambient / background producers ────────────────────────────────────
  "live-player-complete-write": {
    table: "ambient",
    gesture: "A session reaches its terminal state (finishes, or is stopped)",
    effect:
      "updateSession.mutate({ status: completed, completedAt, finalElapsedMs }).",
    renders: {
      working: "None.",
      succeeded:
        "None *of the write* — CompletionSummary renders immediately from a locally-computed `completedSession` object regardless of whether the persist has resolved yet, so the screen looks done whether or not it is.",
      failed:
        "Nothing, and unusually deceptively: the completion screen the person is looking at claims the session ended in a state the server was never told about.",
    },
    presentation: "ambient",
    justification:
      "The gesture that ends a session (finishing it, or Stop) already has its own on-screen confirmation — the completion screen itself. This write is bookkeeping behind that screen, not something the person is separately waiting on. That is what makes rendering it as though it already succeeded, before it has, the wrong call rather than a defensible one: an ambient write can be silent about progress; it should not assert an outcome it does not yet have.",
    cancellable: false,
    cancelNote: "Single request, fired once per session's terminal transition.",
  },
  "layout-autosave": {
    table: "ambient",
    gesture: "Drag/resize/bind a panel while in the live layout editor",
    effect:
      "updateSession.mutate({ id, patch }) from three sites: a 350ms-debounced " +
      "persist after any tree change (schedulePersist), a flush of the pending " +
      "write on leaving edit mode (toggleEditMode), and an immediate persist on " +
      "binding a panel (onBind).",
    renders: {
      working: "None — no `isPending` read anywhere in this file.",
      succeeded: "None.",
      failed:
        "Nothing. A rearrangement the person just made can be silently lost with no trace it was ever attempted.",
    },
    presentation: "ambient",
    justification:
      '#940 names this as the hard case on purpose: it is ambient by every surface signal (no click, no button, a debounce nobody asked for) but the work it loses is real and was explicitly authored by the person a moment before. Two axes are not enough to say "silent is fine" here the way it is for, say, a background sync — silence is defensible for *progress*, but losing the edit outright without a trace is not defensible at any presentation tier. This is the case that motivates a third value beyond interactive/ambient: call it ambient-but-durable, meaning failure has to survive the tab even if progress does not have to announce itself. #935 is where that gets designed; this row is the evidence it is needed.',
    cancellable: false,
    cancelNote:
      "Individual writes are fast, but the *editing session* — repeated resizes over a couple of minutes — is exactly the shape where a person would want to know 'is my last change actually saved' before navigating away, which today they cannot.",
  },
  "audio-preferences-toggle": {
    table: "ambient",
    gesture:
      "Toggle an audio preference (e.g. from the audio indicator elsewhere in the app)",
    effect:
      "updateSettings.mutate(updated) — after the query cache is already written optimistically.",
    renders: {
      working:
        "None (by design, per this file's own header comment: a toggle that waits on a round-trip feels broken).",
      succeeded:
        "Already shown, optimistically, before the request even starts.",
      failed:
        "Nothing — and here optimism has a real cost the header comment does not name: there is no `onError` to roll the cache back, so a failed write leaves every reader of `settingsKey` (the indicator, the speech provider, the viewport) believing a preference took effect that the server never received. The next full settings refetch is the only thing that would correct it.",
    },
    presentation: "ambient",
    justification:
      "Correctly ambient as a presentation choice — the header comment's reasoning (a toggle should not wait on a round-trip) holds up. What is not addressed by that reasoning is failure: ambient means the person is not told while it is in flight, not that a failure is allowed to go permanently unrepaired. The gap is the missing rollback, not the missing spinner.",
    cancellable: false,
    cancelNote:
      "Single request, and the point of the design is that nothing waits on it.",
  },
  "session-signal-report": {
    table: "ambient",
    gesture:
      "Rides along the composer's create/update-session gestures above (composer-save-draft, composer-save-and-play, and any other updateSession caller whose status actually changes)",
    effect:
      "reportSessionTransition → reportSignal → POST /signals, from useCreateSession/useUpdateSession's own onSuccess.",
    renders: {
      working: "None.",
      succeeded: "None — and deliberately so; see below.",
      failed:
        "Nothing, by explicit design: `reportSignal` swallows every failure and its own doc comment says why.",
    },
    presentation: "ambient",
    justification:
      "Silence here is a defended, in-source position, not an omission: the module header states the tradeoff plainly — a signal that blocks a mutation would cost someone the ability to start a study session over a LAN box being down, and a missing signal only costs some accuracy in *when* a reminder lands. Included in the census specifically because #940 asks for the hard cases to be classified explicitly rather than assumed, and this is the one case in the whole population where 'ambient, and silent even on failure' is the correct call end to end, not merely the current one.",
    cancellable: false,
    cancelNote:
      "Fire-and-forget; there is nothing a cancel affordance would attach to.",
  },
  "sessions-backend-migration": {
    table: "ambient",
    gesture:
      "App load, once, when `file_host` mode has local sessions to carry over",
    effect:
      "migrateLocalSessions(remote, storage), awaited by every SessionsStore method via `ready` before it does anything else.",
    renders: {
      working:
        "None — nothing on screen indicates a migration is in progress, and every session call silently waits behind it.",
      succeeded:
        "None — a fully successful migration produces no different UI from one that never had anything to migrate.",
      failed:
        "A partial migration is reported with `console.warn` only — invisible to anyone who is not a developer with devtools open. A fully failed read (the outer `.catch(() => {})`) is invisible even there.",
    },
    presentation: "ambient",
    justification:
      "Not a gesture at all — no click initiates it — but named explicitly in the epic body as 'the same failure wearing different clothes' as #933, and #938's own task list calls it out by file:line. Included so the census is not artificially narrowed to click-triggered effects only; a person whose sessions silently failed to carry over did not click anything, and that is precisely the point.",
    cancellable: false,
    cancelNote:
      "One-shot, at most once per browser per backend switch; not something a person could meaningfully cancel even if they knew it was running.",
  },
  "nudge-background-registration": {
    table: "ambient",
    gesture:
      "Reminders are enabled (page load / preference change, not a click on this render)",
    effect:
      "useEffect → registerNudgeWorker() once reminders are on; a second " +
      "useEffect → reconcilePushSubscription({ topics }) to re-post a " +
      "subscription the server may have pruned.",
    renders: {
      working: "None.",
      succeeded: "None.",
      failed:
        "Nothing — both degrade to #907's client-only behaviour rather than throwing, by design, per this file's own comments.",
    },
    presentation: "ambient",
    justification:
      "Background reconciliation of a already-granted subscription; nothing the person did on this render asked for it, and the degrade-not-throw behaviour is a deliberate, documented choice in the source rather than an accident.",
    cancellable: false,
    cancelNote:
      "Not user-initiated; a cancel affordance has nothing to attach to.",
  },
}

/**
 * One entry per call site `walk.mjs` can produce (`file:line`).
 *
 * `row` points into `ROWS`; `group` classifies the sites that are not
 * separately-classified intents:
 *  - `"gesture-child"` — a nested continuation of a composite row (session-
 *    composer's chained update), listed under the parent rather than
 *    tabulated again.
 *  - `"definition"` — one of the 8 `useMutation(` definitions in
 *    `hooks.ts`: the *shape* of an intent, not an instance of one.
 *  - `"infra"` — implementation plumbing (the shared fetch wrapper, the
 *    browser-API primitives `service-worker.ts` wraps, the localStorage
 *    adapter `storage.ts` provides) that every gesture-level row above
 *    already accounts for at the point where a person could observe it.
 *  - `"out-of-scope"` — a real producer, excluded on purpose, with a
 *    reason recorded rather than just omitted.
 */
export const SITE_ANNOTATIONS = {
  "apps/www/src/components/composer/session-composer.tsx:182": {
    row: "composer-save-draft",
    detail: "update path — editing an existing draft",
  },
  "apps/www/src/components/composer/session-composer.tsx:203": {
    row: "composer-save-draft",
    detail: "create path — new session",
  },
  "apps/www/src/components/composer/session-composer.tsx:216": {
    row: "composer-save-and-play",
    detail: "update path — editing an existing draft, single request",
  },
  "apps/www/src/components/composer/session-composer.tsx:241": {
    row: "composer-save-and-play",
    detail: "create path — new session, parent of the chained update below",
  },
  "apps/www/src/components/composer/session-composer.tsx:245": {
    row: "composer-save-and-play",
    detail:
      "chained update, nested in the create call's onSuccess — the #933 flow",
  },

  "apps/www/src/components/player/completion-summary.tsx:40": {
    row: "completion-summary-replay",
  },
  "apps/www/src/components/player/live-player.tsx:63": {
    row: "live-player-complete-write",
  },
  "apps/www/src/components/player/use-live-layout-editor.ts:64": {
    row: "layout-autosave",
    detail: "schedulePersist — 350ms debounce after a tree change",
  },
  "apps/www/src/components/player/use-live-layout-editor.ts:81": {
    row: "layout-autosave",
    detail: "toggleEditMode — flush on leaving edit mode",
  },
  "apps/www/src/components/player/use-live-layout-editor.ts:112": {
    row: "layout-autosave",
    detail: "onBind — immediate persist on binding a panel",
  },

  "apps/www/src/components/settings/study-nudge-section.tsx:161": {
    row: "nudge-background-registration",
    detail: "hasPushSubscription — read on mount/deps change, not a click",
  },
  "apps/www/src/components/settings/study-nudge-section.tsx:164": {
    row: "nudge-background-registration",
    detail: "fetchPushTopics — same effect",
  },
  "apps/www/src/components/settings/study-nudge-section.tsx:179": {
    row: "nudge-toggle",
    detail: "off-branch — unsubscribeFromPush",
  },
  "apps/www/src/components/settings/study-nudge-section.tsx:185": {
    row: "nudge-toggle",
    detail: "on-branch — requestNudgePermission, parent of the two below",
  },
  "apps/www/src/components/settings/study-nudge-section.tsx:196": {
    row: "nudge-toggle",
    detail: "on-branch — registerNudgeWorker",
  },
  "apps/www/src/components/settings/study-nudge-section.tsx:199": {
    row: "nudge-toggle",
    detail: "on-branch — subscribeToPush",
  },
  "apps/www/src/components/settings/study-nudge-section.tsx:218": {
    row: "nudge-send-test",
  },
  "apps/www/src/components/settings/study-nudge-section.tsx:346": {
    row: "nudge-topic-checkbox",
  },

  "apps/www/src/lib/audio-preferences/use-audio-preferences.ts:44": {
    row: "audio-preferences-toggle",
  },

  "apps/www/src/lib/file-host-config/client.ts:94": {
    row: null,
    group: "infra",
    note: "The one fetch() every file_host caller goes through. Every gesture-level row above that talks to file_host resolves here; it is the transport, not a decision of its own.",
  },

  "apps/www/src/lib/study-nudge/service-worker.ts:75": {
    row: null,
    group: "infra",
    note: "Notification.requestPermission — implementation of requestNudgePermission (nudge-toggle).",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:96": {
    row: null,
    group: "infra",
    note: "navigator.serviceWorker.register — implementation of registerNudgeWorker (nudge-toggle / nudge-background-registration).",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:114": {
    row: null,
    group: "infra",
    note: "showNudge's own call to registerNudgeWorker — internal, not a new gesture.",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:118": {
    row: null,
    group: "infra",
    note: "registration.showNotification — implementation of showNudge (nudge-send-test).",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:145": {
    row: null,
    group: "infra",
    note: "recordNudgeShown's localStorage write — a cooldown timestamp. Its own try/catch deliberately swallows a write failure (documented in-source: costs a cooldown, not the feature).",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:300": {
    row: null,
    group: "infra",
    note: "resolveRegistration's call to registerNudgeWorker — internal.",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:395": {
    row: null,
    group: "infra",
    note: "pushManager.getSubscription — implementation of subscribeToPush.",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:396": {
    row: null,
    group: "infra",
    note: "pushManager.subscribe — implementation of subscribeToPush.",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:450": {
    row: null,
    group: "infra",
    note: "pushManager.getSubscription — implementation of unsubscribeFromPush.",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:456": {
    row: null,
    group: "infra",
    note: "subscription.unsubscribe — implementation of unsubscribeFromPush. Wrapped in a try/catch that deliberately keeps going on failure (documented in-source: the server row is the half that matters).",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:492": {
    row: null,
    group: "infra",
    note: "pushManager.getSubscription — implementation of hasPushSubscription.",
  },
  "apps/www/src/lib/study-nudge/service-worker.ts:516": {
    row: null,
    group: "infra",
    note: "pushManager.getSubscription — implementation of reconcilePushSubscription (nudge-background-registration).",
  },

  "apps/www/src/lib/study-nudge/use-study-nudge.ts:154": {
    row: "nudge-background-registration",
    detail: "registerNudgeWorker — effect on preferences.enabled",
  },
  "apps/www/src/lib/study-nudge/use-study-nudge.ts:167": {
    row: "nudge-background-registration",
    detail: "reconcilePushSubscription — effect on preferences/topics",
  },

  "apps/www/src/lib/tenant/hooks.ts:52": {
    row: null,
    group: "definition",
    note: "useUpdateProfile — no onError.",
  },
  "apps/www/src/lib/tenant/hooks.ts:73": {
    row: null,
    group: "definition",
    note: "useUpdateSettings — no onError.",
  },
  "apps/www/src/lib/tenant/hooks.ts:109": {
    row: null,
    group: "definition",
    note: "useCreateSession — no onError; onSuccess fans out to reportSessionTransition.",
  },
  "apps/www/src/lib/tenant/hooks.ts:116": {
    row: "session-signal-report",
    detail: "useCreateSession's onSuccess → reportSessionTransition",
  },
  "apps/www/src/lib/tenant/hooks.ts:128": {
    row: null,
    group: "definition",
    note: "useUpdateSession — no onError; onSuccess fans out to reportSessionTransition when a previous record was cached.",
  },
  "apps/www/src/lib/tenant/hooks.ts:145": {
    row: "session-signal-report",
    detail: "useUpdateSession's onSuccess → reportSessionTransition",
  },
  "apps/www/src/lib/tenant/hooks.ts:153": {
    row: null,
    group: "definition",
    note: "useDeleteSession — no onError.",
  },
  "apps/www/src/lib/tenant/hooks.ts:167": {
    row: null,
    group: "definition",
    note: "useDuplicateSession — no onError.",
  },
  "apps/www/src/lib/tenant/hooks.ts:181": {
    row: null,
    group: "definition",
    note: "useDeleteManySessions — no onError.",
  },
  "apps/www/src/lib/tenant/hooks.ts:196": {
    row: null,
    group: "definition",
    note: "useUpdateStatusManySessions — no onError; onSuccess comment explicitly defends the silence for this one (bulk housekeeping, not a reportable behaviour).",
  },

  "apps/www/src/lib/tenant/sessions-backend.ts:113": {
    row: "sessions-backend-migration",
  },

  "apps/www/src/lib/tenant/storage.ts:15": {
    row: null,
    group: "infra",
    note: "browserLocalStorage's setItem — underlies the static-mode SessionsRepository; already represented by the mutate-call sites that invoke it.",
  },
  "apps/www/src/lib/tenant/storage.ts:18": {
    row: null,
    group: "infra",
    note: "browserLocalStorage's removeItem — same.",
  },

  "apps/www/src/lib/topik-content/index.ts:67": {
    row: null,
    group: "out-of-scope",
    note: "Companion-content manifest loading (gated on FETCHES_CONTENT), triggered by mounting a route, not by a user gesture. Excluded per the epic's own definition of a producer; recorded here rather than silently dropped from the walk.",
  },

  "apps/www/src/routes/_dashboard/profile.tsx:65": { row: "profile-save" },

  "apps/www/src/routes/_dashboard/sessions/index.tsx:68": {
    row: "sessions-duplicate",
  },
  "apps/www/src/routes/_dashboard/sessions/index.tsx:72": {
    row: "sessions-delete",
    detail:
      "the confirm() gate — a real, positive pre-action signal, not itself a failure path",
  },
  "apps/www/src/routes/_dashboard/sessions/index.tsx:73": {
    row: "sessions-delete",
    detail: "the mutate call, reached only if confirm() returned true",
  },
  "apps/www/src/routes/_dashboard/sessions/index.tsx:239": {
    row: "sessions-bulk-delete",
    detail: "the confirm() gate",
  },
  "apps/www/src/routes/_dashboard/sessions/index.tsx:243": {
    row: "sessions-bulk-delete",
    detail: "the mutate call",
  },
  "apps/www/src/routes/_dashboard/sessions/index.tsx:249": {
    row: "sessions-bulk-status",
  },

  "apps/www/src/routes/_dashboard/settings.tsx:98": { row: "settings-save" },
}
