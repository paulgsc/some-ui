/**
 * The three enforcement layers for writes, and which catches what.
 *
 * | Layer | Mechanism | Catches | Cannot catch |
 * | --- | --- | --- | --- |
 * | Type | `matchIntent`'s required `IntentArms`, plus `@typescript-eslint/switch-exhaustiveness-check` (enabled for this workspace in `eslint.config.js`) | A rendered intent missing an arm; a raw `switch (intent.status)` missing a case | An effect that never became an intent in the first place |
 * | Lint | `intent-guard/no-unbounded-intent` (same `eslint.config.js`) | An effect (`fetch`/`.mutate`/`.mutateAsync`) initiated from inside a JSX event handler without going through `useIntent`/`useAsyncIntent` | An intent whose `failed` arm renders `null` - that is well-typed and routes through the boundary correctly, it just renders nothing |
 * | Test | The sabotage suite (`**\/*.intent.test.tsx`, sabotaging `file_host` via `test-support/file-host-sabotage.ts`) | A user-visible outcome that isn't actually visible - the empty-`<div>` `failed` arm neither of the other two layers can see | Paths no spec drives |
 *
 * None suffices alone. `assertNever` (from `@some-ui/intent-kit`) is what
 * `switch-lint/require-fail-fast-default` requires a `default` arm to call,
 * turning a missing case into a compile error and a runtime throw.
 */

export { useIntent } from "./use-intent"
export { useAsyncIntent } from "./use-async-intent"
export { useIntentEffect } from "./use-intent-effect"
export { composeSequentialIntents } from "./compose"
