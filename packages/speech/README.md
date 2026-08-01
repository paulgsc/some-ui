# `@some-ui/speech`

The single owner of speech in this repo: the queue, the session, and every
backend that can actually say something.

Extracted from `some-ui-utils` per [#533][issue] and
[`packages/SHARED_WORKSPACE_DOCTRINE.md`][doctrine] — the concern cleared
the defense test with four genuine consumers (`apps/www`, `packages/ui/chat`,
`packages/ui/stepper`, `packages/ui/umag`), and two more that had each
re-derived their own browser-TTS plumbing rather than reach for the shared
one (`packages/ui/interview`, `packages/ui/honeycomb`).

## The idiom

**A consumer says what it wants said. It does not know how.**

```tsx
// The app: one session, configured by deployment, at the root.
<SpeechProvider config={{ mode: DATA_MODE, endpoint: resolveTTSEndpoint() }}>
  <App />
</SpeechProvider>
```

```tsx
// A component, anywhere below it.
const { speak } = useSpeechQueue("chat")
speak("안녕하세요", { volume: 1 }, /* priority */ 2)
```

Nothing there names a backend, a host, a port, or an API key. The
`mode` — the same `"static" | "server"` bit `@some-ui/fetch-kit` uses for
data — selects one:

| mode       | where it comes from                | backend                                               |
| ---------- | ---------------------------------- | ----------------------------------------------------- |
| `"server"` | `vite dev`, `vite preview`, Docker | `openai-edge-tts` over HTTP (`infra/compose/tts.yml`) |
| `"static"` | the GitHub Pages build             | the browser's own `speechSynthesis`                   |

That mapping is `DEFAULT_SPEECH_ADAPTERS` in `lib/adapters/registry.ts`, and
it is a default, not a rule: `config.adapters` replaces either entry,
`config.mode` pins the choice, and every knob the built-in factories read —
endpoint, key, provider, format, timeout, voice — is a config field. If the
resolved adapter reports `supported === false` (a browser with no Web Audio,
say), the other one is used instead, because that is a fact about the
browser rather than about the deployment and the caller has no business
handling it.

## The settlement contract

Speech is a long-running, interruptible side effect, and the bug class this
package was rewritten around is a promise that never settles. Every adapter
obeys four laws, and `lib/adapters/adapter-contract.test.ts` runs the same
suite against each of them:

1. A `speak()` promise settles **exactly once**.
2. Cancellation — the caller's signal, `stop()`, `dispose()` — rejects with
   an **`AbortError`**. Real failures reject with the real error. The queue
   uses that split to decide between dropping an utterance and retrying it.
3. `stop()` and `dispose()` **flush**: when they return, `pending === 0`.
4. Disposal is **terminal**.

`lib/promise` is where that discipline lives; a new backend that opens its
promises through a `SpeechLedger` gets most of it for free.

## What this replaced, and why it mattered

The previous implementation could not end a session. `initializeSpeechQueue`
assigned a module-level singleton once and logged a warning on every later
call, handing back the _first_ manager forever; the playback engine was a
React hook whose refs died with the component that mounted it, while the
promises awaiting them did not; and `stop()` replaced its queue with a fresh
`Promise.resolve()`, stranding whatever was waiting on the old one. Switching
TTS provider, remounting the provider, or navigating between two pages that
both initialize speech all took those paths — and the new session inherited a
queue holding the old session's undelivered items, wedged behind an `await`
that would never resume.

The tests that pin the fix are worth reading as a description of it:
`lib/queue/singleton.test.ts` (a session cannot poison the next one),
`lib/queue/manager.test.ts` (a cancel stops speech now, not when the audio
happens to end), `lib/engine/audio-player.test.ts` and
`lib/promise/index.property.test.ts` (for any interleaving of operations,
nothing is left pending).

[issue]: https://github.com/paulgsc/some-ui/issues/533
[doctrine]: ../SHARED_WORKSPACE_DOCTRINE.md
