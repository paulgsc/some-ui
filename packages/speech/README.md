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
<SpeechProvider
  config={{
    mode: DATA_MODE,
    endpoint: resolveTTSEndpoint(),
    adapters: { server: httpSpeech, static: webSpeech },
  }}
>
  <App />
</SpeechProvider>
```

```tsx
// An applet, anywhere below it: a line in a language, never a voice.
const speaker = useSpeaker() // this component's handle; null without a provider
const outcome = await speaker?.say("안녕하세요", { language: "korean" })
// { kind: "heard" | "muted" | "preempted" | "cancelled" | "failed" | "ended" }
```

### One writer

The session is the only thing that writes to the page's voice. An adapter
plays one line at a time and a new line cancels the one playing, so applets
writing to it directly could never tell why their line stopped, and had to
guess from shared state read afterwards. Instead each component gets its
own `Speaker` handle (`lib/speaker`), and every line, from every applet and
from the queue (`useSpeechQueue`), goes through the session's one queue:

- A line says its **urgency**. `"now"` (a tapped word, a replay button)
  interrupts what is playing; `"next"` (a lesson's next line) waits its
  turn, and if a `"now"` line interrupts it the session says it again
  afterwards.
- `say` resolves with the line's **outcome** and never rejects, so an applet
  switches on what happened instead of inferring it from an `AbortError`.
- A handle's `stop` cancels **its own lines only**.

What is shared is only read: whether the person muted, and who would speak a
language (`describe`, with `subscribe` to hear when either changes).

A handle cannot name a voice or reach the adapter either, because the
session owns what a person decides about speech: **which voice** (their
choice in Settings speaks every line in its language) and **whether it is
muted**. TOPIK once held the adapter, named "the first Korean voice" on
every line and called the adapter directly, so a chosen voice never spoke a
lesson and mute stopped only the line already playing.

The one line that names a voice is Settings' sample of a voice a person is
choosing between (`useVoicePreview`). It is a request to the session too
(`SpeechQueueManager.preview`): a `"now"` line through the same queue, so it
interrupts what plays, honors mute, and leaves the lesson it cut off to be
said again, instead of writing to the engine behind the session's back.

### Our languages, their tags

A line's language is a `SpokenLanguage` (`lib/language`): a closed union of
the languages this site speaks, not a tag. Platforms name languages with tags
whose shapes are theirs (`ko-KR`, `ko_KR`, `kor`), and only an adapter, or
the app's transport behind one (the phone's, in `apps/www`'s
`lib/device-speech/native.ts`), ever reads one, through `spokenLanguageOf`,
which answers with one of ours or `null`, and writes one, from
`LANGUAGE_TAG`. Likewise `describe` reports `availability` as one of four states
(`available`, `missing`, `checking`, `unverifiable`) rather than a boolean, so
"the browser has not loaded its voices yet" is not shown as "no Korean
voice".

Nothing there names a backend, a host, a port, or an API key. The
`mode` — the same `"static" | "server"` bit `@some-ui/fetch-kit` uses for
data — selects one of the backends the app passed:

| mode       | where it comes from                | backend                                                             |
| ---------- | ---------------------------------- | ------------------------------------------------------------------- |
| `"server"` | `vite dev`, `vite preview`, Docker | `httpSpeech`: `openai-edge-tts` over HTTP (`infra/compose/tts.yml`) |
| `"static"` | the GitHub Pages build, the APK    | `webSpeech` or `nativeSpeech`: the device's own voice (below)       |

Each backend is its own package entry, and the app names the ones it runs:

```tsx
import { httpSpeech } from "@some-ui/speech/http"
import { webSpeech } from "@some-ui/speech/web-speech"

<SpeechProvider config={{ mode, adapters: { server: httpSpeech, static: webSpeech } }}>
```

There are no defaults, because a default is an import, and an import ships
in every build whether it runs there or not: the Android app passes only
`nativeSpeech`, and its build carries neither the HTTP client nor the
browser's synthesizer (`apps/www/build.paths.ts` checks it).
`src/entries.test.ts` fails if the main entry, or one backend's entry,
reaches another backend's code at runtime, which would move that code into a
chunk every build loads. The backend each entry exports is an inert token
only the session can turn into an adapter (`lib/adapters/backend.ts`), so an
applet holding one still cannot build an adapter. The HTTP entry also carries
the HTTP engine's own primitives (`createTTSClient`, `createAudioPlayer`),
which play audio directly; they are there for the HTTP backend, not for
applets, as they were when the main entry exported them. `config.adapters`
also takes a factory of the caller's own (a test fake, a future backend),
`config.mode` pins the choice, and every knob a backend reads — endpoint,
key, hosted voice, format, timeout — is a config field. If the resolved
adapter reports `supported === false` (a browser with no Web Audio, say), or
the app passed nothing for that mode, the other mode's is used instead,
because that is a fact about the browser rather than about the deployment and
the caller has no business handling it. With nothing for either mode, the
session refuses to start.

### Two kinds of voice, never mixed

- **Hosted voices are ours, and closed.** Every one is in `BUILTIN_VOICES`,
  so `HostedVoiceOf<P>` (`lib/voices`) is a compile-time union and
  `config.hosted` pairs a provider with one of its own voices or with
  nothing chosen. `hostedVoiceFor` decides each line: the chosen voice when
  it speaks the line's language, else that language's declared default
  (`DEFAULT_HOSTED_VOICE`), else no voice and an honest failure. Nothing
  falls back to "the first voice in the list". A stored string becomes a
  choice in one place, `parseHostedVoiceChoice`.
- **The device's voices are not ours.** The browser's `speechSynthesis`,
  and the phone's text-to-speech that the Android app passes as
  `config.native` (its WebView has no working `speechSynthesis`), are
  someone else's API with someone else's voices, different on every device.
  They are handed a language and speak it in whatever voice they have, or
  in the one the person picked from the phone's own list; none of their
  voices ever becomes a `VoiceConfig`. A phone without voice data for the
  language refuses the line (`VoiceMissingError`) and the app hears about
  it through `native.onMissingVoice`, instead of the lesson staying silent.

## Telling the person

Everything above is machinery, and none of it is a user's problem. But a page
that starts talking unprompted is a surprise, and a page that has quietly lost
the ability to talk is worse — the applet looks fine and simply never speaks
again. So the session discloses itself, in a vocabulary with no internals in
it: **which voice** (the one built into your device, or one this deployment
hosts — the distinction worth disclosing, since one sends text off the machine
and the other doesn't) and **whether it works** (ready, faulted, unavailable).

The budget is three notices per session, and it is enforced by a state machine
rather than by the caller:

| when                                | notice                  |
| ----------------------------------- | ----------------------- |
| the session activates               | `activated` (info)      |
| speech breaks                       | `faulted` (warning)     |
| an utterance succeeds after a fault | `recovered` (info)      |
| the runtime cannot speak at all     | `unavailable` (warning) |

Repeating a status emits nothing. **N consecutive failures are one notice** —
the fault _episode_ is the unit, not the error — and a failing backend against
a chat applet that speaks per message produces exactly one warning, not forty.
No two consecutive notices are ever identical. Those rules are property tests
over arbitrary status sequences in `lib/status/index.test.ts`, because the
failure mode is precisely the interleaving nobody thought of; the version of
this that shipped one toast per retry was caught by
`components/speech-status/index.test.tsx` driving a real failing session.

Notices carry prose, never identifiers — no hostname, port, adapter name or
backend error string reaches a person. The underlying error stays in the queue
state, where a developer can read it.

```tsx
<SpeechProvider config={…} notify={(n) => toast[n.tone](n.title, { description: n.description })}>
```

### Where a toast is the wrong instrument

`apps/www` deliberately **drops** the `activated` notice rather than
toasting it. A toast on initial mount is the easiest thing in an interface
to miss - it lands while a person is still orienting themselves visually
and is gone before they look - so "this app has a voice" is disclosed by
things that don't disappear: a persistent speaker indicator in the chrome,
and a one-time inline notice on an activity that uses audio. What reaches
the toaster is the part a toast is genuinely good at: acknowledging
something that happened and that the person did not do, which is speech
breaking, recovering, or turning out to be unsupported.

Muting is the mirror image and the package handles it directly: while
`muted`, the announcer emits nothing at all. A person who just clicked a
mute toggle does not need a toast confirming their own click, and
"voice output is on" would be false.

`notify` is the app's, not this package's — the one place this workspace
deliberately stops short of owning the concern. `apps/www` mounts exactly one
`<Toaster />`, and a library rendering its own would stack a second toaster
beside it with its own placement, theme and z-order. This package decides
_what_ is worth saying and _when_, which is the part that must not be
re-derived per applet, and hands the rendering to whoever already owns it.
Omitting `notify` is silent but never undisclosed: the provider always
mirrors the current status into an `aria-live` region. Applets that want a
standing indicator can drop in `SpeechStatusBadge`, or build their own on
`useSpeechStatus()`.

## The settlement contract

Speech is a long-running, interruptible side effect, and the bug class this
package was rewritten around is a promise that never settles. Every adapter
obeys four laws, and `lib/adapters/__tests__/adapter-contract.test.ts` runs the same
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
`lib/queue/__tests__/singleton.test.ts` (a session cannot poison the next one),
`lib/queue/__tests__/manager.test.ts` (a cancel stops speech now, not when the audio
happens to end), `lib/engine/audio-player.test.ts` and
`lib/promise/index.property.test.ts` (for any interleaving of operations,
nothing is left pending).

[issue]: https://github.com/paulgsc/some-ui/issues/533
[doctrine]: ../SHARED_WORKSPACE_DOCTRINE.md
