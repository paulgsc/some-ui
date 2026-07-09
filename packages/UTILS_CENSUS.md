# `some-ui-utils` / `some-ui-shared` Named-Import Consumer Census

> Evidence base for UTL-FOUND S2 (#521). Every hoist/keep/de-hoist decision
> in this milestone is scored against this table via the
> [Doctrine](./SHARED_WORKSPACE_DOCTRINE.md) §3 decision matrix — not
> against `package.json` dependency lists, which overcount (see
> [Declared-but-unused](#declared-but-unused-dependencies) below).
>
> **Method:** every `import {...} from "some-ui-utils"` / `"some-ui-shared"`
> statement in the repo (single- and multi-line, including `import type`),
> excluding each package's own source tree, grouped by symbol → consuming
> workspace → file. Zero-hit symbols were re-checked by hand to distinguish
> "no consumers" from "internal-only, consumed by another exported hook."
> Package specifiers confirmed against each package's `package.json` `name`
> field — note `some-ui-shared` (not `@some-ui/shared`; that scope belongs
> to the unrelated `@some-ui/styles` package).
>
> Zero code moves in this doc. Cleanup items called out below (dead code,
> unreachable exports, stale deps) are evidence for later stories, not
> action taken here.

## 1. Pure utils

| Symbol                                      | Real consumers                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Verdict                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `cn` (`lib/cn.ts`)                          | **18 workspaces**: `apps/www`, root `.storybook`, `packages/some-content`, `packages/ui/attributions`, `packages/ui/chat`, `packages/ui/emoji-animations`, `packages/ui/input`, `packages/ui/makjang`, `packages/ui/neon-sign`, `packages/ui/nfl`, `packages/ui/overlays`, `packages/ui/resume`, `packages/ui/searchbar`, `packages/ui/shared` (`components/ui/tatu/index.tsx`), `packages/ui/slideshow`, `packages/ui/stepper`, `packages/ui/umag`, `packages/ui/wireframes` | **hoist** — widest-reaching export in the package |
| `getAcronymFromString` (`string-utils.ts`)  | 1 workspace: `packages/ui/shared/src/components/ui/with-avatar/index.tsx`                                                                                                                                                                                                                                                                                                                                                                                                     | **de-hoist**                                      |
| `formatRelativeTime` (`date-utils.ts`)      | 2 workspaces: `apps/www`, `packages/ui/chat`                                                                                                                                                                                                                                                                                                                                                                                                                                  | **borderline → flag for DEHOIST S5**              |
| `getRandomSubarray` (`array-utils.ts`)      | 2 workspaces: `packages/ui/input` (`use-crossword-wasm`), `packages/ui/slideshow` (`rotating-cube.ts`)                                                                                                                                                                                                                                                                                                                                                                        | **borderline → flag for DEHOIST S5**              |
| `createSequentialCycler` (`array-utils.ts`) | 1 workspace: `packages/ui/stepper/src/hooks/use-accordion-stepper.ts`                                                                                                                                                                                                                                                                                                                                                                                                         | **de-hoist**                                      |

## 2. Generic hooks (`lib/hooks/*`)

| Symbol                      | Real consumers                                                                                                     | Verdict                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `useLocalStorage`           | 4 workspaces: `packages/ui/chat`, `packages/ui/emoji-animations`, `packages/ui/neon-sign`, `packages/ui/slideshow` | **hoist**                                      |
| `useMeasureRect`            | 4 workspaces: `packages/ui/chat`, `packages/ui/nfl`, `packages/ui/shared`, `packages/ui/slideshow`                 | **hoist**                                      |
| `useContainerRect`          | 1 workspace: `packages/ui/slideshow/src/components/cube-geometry/index.tsx`                                        | **de-hoist**                                   |
| `useEventListener`          | 1 workspace: `packages/ui/searchbar/src/components/searchbar/searchbar.tsx`                                        | **de-hoist**                                   |
| `useIsomorphicLayoutEffect` | 1 workspace: `packages/ui/searchbar/src/components/searchbar-input/searchbar-input.tsx`                            | **de-hoist**                                   |
| `useIsMobile`               | 1 workspace: `packages/ui/shared/src/components/ui/sidebar.tsx`                                                    | **de-hoist**                                   |
| `useResizeObserver`         | 0 external — internal to `useMeasureRect` only                                                                     | **no external consumers** (internal substrate) |
| `useIsMounted`              | 0 external — internal to `useResizeObserver` only (two layers deep)                                                | **no external consumers** (internal substrate) |
| `useInterval`               | 0 usages anywhere, including inside `packages/utils`                                                               | **dead code**                                  |
| `useFetch`                  | 0 usages anywhere, including inside `packages/utils`                                                               | **dead code**                                  |

## 3. Websocket engine (`lib/hooks/websocket/*`)

Not re-exported by `hooks/index.ts` — no `export * from "./websocket"` exists.
The only importers are internal: `socket-tenants/use-obs-socket.ts`,
`socket-tenants/use-prompt-utterance.ts`,
`socket-tenants/use-now-playing-socket.ts`,
`socket-tenants/orchestrator/use-orchestrator.ts`.

**Verdict: no external consumers — confirmed pure internal substrate** for
the socket-tenants hooks in §7–8, §14 below. Correctly out of scope for
hoist/de-hoist; must never be publicly exported.

## 4. Speech / TTS / audio

| Symbol                                                                                                                                  | Real consumers                                                                                                                                                                     | Verdict                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `useAudioTTS`                                                                                                                           | 2 workspaces: `apps/www` (`providers/tts.tsx`), `packages/ui/chat`                                                                                                                 | **borderline → flag for DEHOIST S5** |
| `useAudioFromStorage`                                                                                                                   | 1 workspace: `packages/ui/umag/src/components/now-playing/audio-player/demo/index.tsx`                                                                                             | **de-hoist**                         |
| `useSpeechQueue`                                                                                                                        | 3 workspaces: `packages/ui/chat`, `packages/ui/stepper`, `packages/ui/umag`                                                                                                        | **hoist**                            |
| `initializeSpeechQueue`                                                                                                                 | 1 workspace: `apps/www/src/providers/tts.tsx`                                                                                                                                      | **de-hoist**                         |
| `useAudioSpeech`                                                                                                                        | 0 external — internal to `useAudioTTS`/`useAudioFromStorage`                                                                                                                       | **no external consumers**            |
| `useTTSFetch`                                                                                                                           | 0 external — internal to `useAudioTTS`                                                                                                                                             | **no external consumers**            |
| `getSpeechQueue`, `useSpeechQueueActions`/actions selectors, metrics selectors                                                          | 0 external, 0 internal beyond definition                                                                                                                                           | **dead code**                        |
| Types `TTSOptions`, `TTSProvider`, `VoiceConfig`, `UseAudioTTSReturn`, `UseAudioTTSOptions`, `UseAudioStorageOptions`, `BUILTIN_VOICES` | span the same 4 workspaces as the hooks above (chat, stepper, umag, www) — **missing from the epic's first-pass list**, tracked here so they move together with any hoist/de-hoist | same tier as cluster verdict         |

**Cluster verdict: hoist** (4 genuinely distinct app/workspace consumers), but
`useAudioSpeech`, `useTTSFetch`, and the unused queue-action/metric selectors
are dead weight on the public surface and are cleanup candidates, not
hoist/de-hoist candidates.

## 5. Viewport / polyhedron (`lib/polyhedron/*`)

| Symbol                                                                        | Real consumers                                                                   | Verdict                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `useViewport`                                                                 | 1 workspace: `packages/ui/slideshow/src/components/viewport-dice-card/index.tsx` | **de-hoist**                              |
| `useCycleRotationAdapter`                                                     | 0 usages anywhere, including inside `packages/utils`                             | **dead code**                             |
| `viewport-engine.ts`, `viewport-manager.ts`, `wasm-runtime.ts`, `viewport.ts` | not re-exported by `polyhedron/index.ts`; no deep imports found                  | **internal-only, unreachable externally** |

Note: `packages/ui/input/src/hooks/use-viewport-rotation-wasm/index.ts` is a
same-sounding but **independent** implementation — it imports only
`createEventBus` from `some-ui-utils` (§12), nothing from `polyhedron/*`. Not
part of this cluster.

## 6. Orchestrator / livestream — the first-pass census conflated two unrelated engines

This is the single most important correction from this census: the
epic's first-pass table names `useLivestreamOchestrator` /
`useOchestrationStore` as if they were the live implementation. They are
not — the actually-used orchestrator is a separate file
(`zustand-store/orchestrator-store.ts`), unrelated to the generic
`context/ochestra/*` store substrate.

### 6a. `zustand-store/orchestrator-store.ts` — the real, consumed implementation

| Symbol                                                                 | Real consumers                                                                                       | Verdict                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `useOrchestratorStore`                                                 | 2 workspaces: `apps/www`, `packages/ui/slideshow`                                                    | hoist tier                                    |
| `useSceneLifetimes`                                                    | 4 workspaces: `apps/www`, `packages/some-content`, `packages/ui/slideshow`, `packages/ui/wireframes` | hoist tier                                    |
| `usePrimaryScene`                                                      | 2 workspaces: `apps/www`, `packages/some-content`                                                    | **borderline** — missing from first-pass list |
| `useOrchestratorClock`, `useIsRunning`, `useIsPaused`, `useIsTerminal` | 1 workspace each: `apps/www`                                                                         | ships with the store                          |
| `selectCurrentTime`, `selectTotalDuration`, `selectIsRunning`          | `packages/ui/slideshow`                                                                              | **missing from first-pass list**              |
| `useMode`, `selectProgress`, `selectConnectionStatus`                  | 0 external                                                                                           | dead code                                     |

Combined distinct consumer workspaces: `apps/www`, `packages/some-content`,
`packages/ui/slideshow`, `packages/ui/wireframes` (4) → **cluster verdict:
hoist**. `usePrimaryScene` individually flagged **borderline → DEHOIST S5**.

### 6b. `context/ochestra/*` — generic store substrate, dead

`createStore`, `useStore`, `createLivestreamOrchestrator`,
`useLivestreamOrchestrator` — **zero external consumers**.
`createLivestreamOrchestrator` and `useLivestreamOrchestrator` aren't even
re-exported by `context/index.ts`, so they're unreachable from the public
`some-ui-utils` surface at all.

**Verdict: dead code / unreachable — cleanup candidate for a follow-up
story, not a hoist/de-hoist decision.**

### 6c. `hooks/socket-tenants/orchestrator/*` — websocket-driven orchestrator hooks

| Symbol                | Real consumers                                 | Verdict                 |
| --------------------- | ---------------------------------------------- | ----------------------- |
| `useOrchestrator`     | root `.storybook` only                         | de-hoist / tooling-only |
| `useMockOrchestrator` | `apps/www/src/providers/orchestrator.tsx` only | de-hoist                |

`mock-orchestrator-engine.ts` internals are not re-exported — internal only.

## 7. OBS socket / store

| Symbol                                                                                                                                                                                                                                                                                                                                                                | Real consumers                                                                                       | Verdict                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `useObsStatusWebSocket`                                                                                                                                                                                                                                                                                                                                               | 2 workspaces: `packages/ui/input`, `packages/ui/overlays`                                            | **borderline → flag for DEHOIST S5** |
| All `obs-store` zustand selectors (`useObsCommands`, `useIsConnected`, `useIsRecording`, `useIsStreaming`, `useCurrentProfile`, `useSceneInfo`, `useStreamTimecode`, `useRecordTimecode`, `useReplayBufferActive`, `useVirtualCamActive`, `useStudioModeEnabled`, `useActiveFps`, `useCpuUsage`, `useConnectionInfo`, `useCurrentCollection`, `useCurrentTransition`) | 1 workspace, 1 file: `packages/ui/overlays/src/components/youtube/demo/index.tsx` (a demo component) | **de-hoist**                         |

The socket hook and the raw store selectors are tracked separately —
averaging them would misstate both.

## 8. Now-playing socket / store

| Symbol                                          | Real consumers                                                                        | Verdict      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ------------ |
| `useLatestNowPlaying`, `useNowPlayingWebSocket` | 1 workspace: `packages/ui/umag/src/components/now-playing/now-playing-card/index.tsx` | **de-hoist** |
| `useNowPlayingStore`, `pushNowPlaying`          | 0 external                                                                            | dead code    |

## 9. Discovery (`lib/discovery/*`)

| Symbol                                                       | Real consumers                                                      | Verdict      |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------ |
| `HttpFileDiscovery`, `HttpJsonLoader`, `useRecursiveLibrary` | 1 workspace: `packages/ui/slideshow/src/hooks/use-scene-library.ts` | **de-hoist** |
| `hasErrors`, `formatLibraryError`                            | 0 external                                                          | dead code    |

## 10. Registry (`lib/registry/*`)

| Symbol                                                                                                                  | Real consumers                                                                                              | Verdict                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `preloadRegistryComponents`, `hasRegistryKey`, `lazyWithPreload`, `renderRegistryComponent`, `ComponentEnhancer` (type) | 3 workspaces (1 call site each): `packages/ui/slideshow`, `packages/some-content`, `packages/ui/wireframes` | **hoist** (thin usage, but 3 genuinely distinct apps) |

## 11. Region-rect-store

| Symbol               | Real consumers                                                                       | Verdict      |
| -------------------- | ------------------------------------------------------------------------------------ | ------------ |
| `useRegionRectStore` | 1 workspace: `packages/ui/wireframes/src/components/layout-rect-publisher/index.tsx` | **de-hoist** |
| `useRegionRect`      | 0 external                                                                           | dead code    |

## 12. Event-bus

| Symbol           | Real consumers                                                                                                                                       | Verdict                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `createEventBus` | 2 workspaces: `packages/ui/slideshow` (`use-rotating-cube.ts`), `packages/ui/input` (`use-create-crossword-puzzle.ts`, `use-viewport-rotation-wasm`) | **borderline → flag for DEHOIST S5** |

`event-bus.ts` also defines `notificationEvents`, `cartEvents`,
`taskManager`, `useSubscribeToNotificationEvents`,
`useHighPriorityTasksFor` — demo/example fixtures, `export *`'d from
`context/index.ts` but **not** included in the curated re-export list
`lib/index.ts` takes from `"./context"`, so they are unreachable via
`import ... from "some-ui-utils"`. (`packages/ui/input`'s own
`notificationEvents` local const is an unrelated same-named local variable,
not an import of this fixture — confirmed by reading the call site.)

**Verdict on the fixtures: dead / unreachable — cleanup candidate.**

## 13. String-query-state

| Symbol                                            | Real consumers                                 | Verdict      |
| ------------------------------------------------- | ---------------------------------------------- | ------------ |
| `useStringQueryState`, `QueryStateOptions` (type) | 1 workspace: `packages/ui/searchbar` (6 files) | **de-hoist** |

## 14. `use-prompt-utterance`

| Symbol                  | Real consumers                                                      | Verdict      |
| ----------------------- | ------------------------------------------------------------------- | ------------ |
| `useUtteranceWebSocket` | 1 workspace: `packages/ui/umag/src/components/prompt-dox/index.tsx` | **de-hoist** |

## 15. `some-ui-shared` non-component exports

| Symbol                        | Real consumers                                                                                                                                                                                                                                                                                             | Verdict                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useToast` (`hooks/index.ts`) | 2 workspaces: `apps/www`, `packages/ui/wireframes`                                                                                                                                                                                                                                                         | **borderline → flag for DEHOIST S5**                                                                                                                                                                                                                  |
| `cn` (`lib/utils.ts`)         | **Not part of the public barrel.** `src/index.ts` only re-exports `./components` and `./hooks` — `lib/utils.ts` is never re-exported. All internal `some-ui-shared` usages go through the `@shared/lib/utils` path alias, not the package barrel. Zero external files import `cn` from `"some-ui-shared"`. | **no external consumers** — and confirmed to be an independent implementation from `some-ui-utils`'s `cn`, not a re-export or duplicate call path. This resolves the ambiguity in the epic's first-pass table: only `some-ui-utils`'s `cn` is public. |

## Declared-but-unused dependencies

Cross-checking `package.json` deps against actual imports found workspaces
that declare a dependency but never import a named symbol — pure
package.json noise, independent of any hoist/de-hoist decision:

| Workspace                     | Declares `some-ui-utils` | Declares `some-ui-shared` | Actual imports                                                                |
| ----------------------------- | ------------------------ | ------------------------- | ----------------------------------------------------------------------------- |
| `packages/ui/portfolio-chart` | yes                      | yes                       | none                                                                          |
| `packages/ui/vidya`           | yes                      | yes                       | none                                                                          |
| `packages/mdx-generator`      | yes                      | no                        | none                                                                          |
| `packages/ui/honeycomb`       | yes                      | yes                       | `some-ui-shared` only (real component consumer); zero `some-ui-utils` imports |

No `extensions/*` workspace declares or imports either package — fully out
of scope for this census.

## Summary

| Concern                                                                                           | Real consumers (excl. utils/shared)                                        | Verdict                                                                  |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `cn` (utils)                                                                                      | 18 workspaces                                                              | hoist                                                                    |
| string/date/array-utils                                                                           | de-hoist / **borderline** / **borderline** / de-hoist (per-symbol, see §1) | mixed — see §1                                                           |
| generic hooks: `useLocalStorage`, `useMeasureRect`                                                | 4 workspaces each                                                          | hoist                                                                    |
| generic hooks: `useContainerRect`, `useEventListener`, `useIsomorphicLayoutEffect`, `useIsMobile` | 1 workspace each                                                           | de-hoist                                                                 |
| generic hooks: `useResizeObserver`, `useIsMounted`                                                | 0 (internal substrate)                                                     | no external consumers                                                    |
| generic hooks: `useFetch`, `useInterval`                                                          | 0 (unused anywhere)                                                        | dead code                                                                |
| websocket engine                                                                                  | 0 (pure substrate for socket-tenants hooks)                                | no external consumers                                                    |
| speech/tts/audio                                                                                  | 4 workspaces (chat, stepper, umag, www)                                    | hoist (leaf hooks `useAudioSpeech`/`useTTSFetch`/queue-metrics are dead) |
| viewport/polyhedron                                                                               | 1 workspace (`useViewport`)                                                | de-hoist (`useCycleRotationAdapter` dead)                                |
| orchestrator — real (`orchestrator-store.ts`)                                                     | 4 workspaces                                                               | hoist (`usePrimaryScene` **borderline**)                                 |
| orchestrator — generic ("ochestra") substrate                                                     | 0                                                                          | dead code / unreachable                                                  |
| orchestrator — socket-tenants hooks                                                               | 1 workspace each                                                           | de-hoist                                                                 |
| obs store selectors                                                                               | 1 workspace (demo only)                                                    | de-hoist                                                                 |
| obs socket hook                                                                                   | 2 workspaces                                                               | **borderline**                                                           |
| now-playing socket/store                                                                          | 1 workspace                                                                | de-hoist                                                                 |
| discovery                                                                                         | 1 workspace                                                                | de-hoist                                                                 |
| registry                                                                                          | 3 workspaces                                                               | hoist                                                                    |
| region-rect-store                                                                                 | 1 workspace                                                                | de-hoist                                                                 |
| event-bus (`createEventBus`)                                                                      | 2 workspaces                                                               | **borderline** (demo fixtures dead/unreachable)                          |
| string-query-state                                                                                | 1 workspace                                                                | de-hoist                                                                 |
| use-prompt-utterance                                                                              | 1 workspace                                                                | de-hoist                                                                 |
| shared `useToast`                                                                                 | 2 workspaces                                                               | **borderline**                                                           |
| shared `cn`                                                                                       | 0 (never publicly exported)                                                | no external consumers                                                    |

**Borderline (exactly-2-consumer) clusters flagged for DEHOIST S5
adjudication:** `formatRelativeTime`, `getRandomSubarray`, `useAudioTTS`,
`usePrimaryScene`, `useObsStatusWebSocket`, `createEventBus`, `useToast`.

## Non-goals

This document is evidence only. It scores no proposed hoist against the
Doctrine §3 matrix (that's DEHOIST S5's job) and moves no code.
