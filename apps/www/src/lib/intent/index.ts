/**
 * #937's three enforcement layers, and which of them catches what. Written
 * down here because this is where the next person adding a write path will
 * be looking, not only in the epic issue.
 *
 * | Layer | Mechanism | Catches | Cannot catch |
 * | --- | --- | --- | --- |
 * | Type | `matchIntent`'s required `IntentArms`, plus `@typescript-eslint/switch-exhaustiveness-check` (enabled for this workspace in `eslint.config.js`) | A rendered intent missing an arm; a raw `switch (intent.status)` missing a case | An effect that never became an intent in the first place |
 * | Lint | `intent-guard/no-unbounded-intent` (same `eslint.config.js`) | An effect (`fetch`/`.mutate`/`.mutateAsync`) initiated from inside a JSX event handler without going through `useIntent`/`useAsyncIntent` | An intent whose `failed` arm renders `null` - that is well-typed and routes through the boundary correctly, it just renders nothing |
 * | Test | The sabotage suite (`**\/*.intent.test.tsx`, sabotaging `file_host` via `test-support/file-host-sabotage.ts`) | A user-visible outcome that isn't actually visible - the empty-`<div>` `failed` arm neither of the other two layers can see | Paths no spec drives |
 * | Runtime | `dropped-write.ts`, called from both guards | A *distinct* write discarded by the thundering-herd guard because one intent instance serves several writes - throws under vitest, warns in a dev browser | A write that is never dispatched at all (no `start()` call to intercept) |
 *
 * The fourth layer is the newest and the least obvious. The first three all
 * watch the path from an event to a rendered outcome; none of them watches
 * whether a dispatch that was asked for actually happened. The
 * thundering-herd guard is the one place that can silently decide it did
 * not, so that is where the check belongs. It is a runtime check rather
 * than a lint rule on purpose: whether a handler represents one intention
 * or many is a fact about what the call site *means*, which no AST shape
 * distinguishes - `onBind(leafId, key)` and `handleSave()` look alike.
 *
 * None of the four is sufficient on its own, and the gaps are why all
 * four exist rather than the strongest of them alone. `assertNever`
 * (re-exported from `@some-ui/intent-kit`) is the one piece of plumbing all
 * three lean on: it's what `switch-lint/require-fail-fast-default` (already
 * active repo-wide) requires a `switch`'s `default` arm to call, and it's
 * what turns "missing a case" from a silent no-op into both a compile error
 * (the argument stops being `never`) and, until that's fixed, a runtime
 * throw.
 */

export { useIntent } from "./use-intent"
export { useAsyncIntent } from "./use-async-intent"
export { useIntentEffect } from "./use-intent-effect"
export { composeSequentialIntents } from "./compose"
