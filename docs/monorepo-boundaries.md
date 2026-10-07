# The package/adapter boundary

The rule, in one line: **`packages/` holds logic that would still make sense
if the framework changed; `apps/` holds the wiring that makes it run in this
one.**

This is the third of three standing documents about shared code, and the one
that answers "where does this module live?":

| Document                                                                            | Answers                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`packages/README.md`](../packages/README.md)                                       | _How_ do I scaffold a leaf workspace?                         |
| [`packages/SHARED_WORKSPACE_DOCTRINE.md`](../packages/SHARED_WORKSPACE_DOCTRINE.md) | _Should_ this export be shared at all? (blast radius)         |
| this one                                                                            | Is this module app glue, or is it a package hiding in an app? |

It exists because there was no such document, and that absence is why the
drift in #754 went unnoticed rather than being caught at review: two modules
under `apps/www/src/lib/` were already framework-agnostic, already fanned out
to six or more consumers each, and already packages in every way except the
boundary.

## What each side is

**A package** is framework-agnostic, composable business logic. Zero React
imports, zero router imports, zero `@/` path aliases. It is testable in a
`node` vitest environment - and that is a checkable property, not a vibe: if
the tests need `jsdom`, it is probably not one.

**An adapter** is thin framework wiring: the hook that subscribes a component
to a store, the provider that mounts a session, the route file that reads a
search param and hands it to a composer. Adapters are allowed to be
app-specific, allowed to know about `@tanstack/react-router`, and allowed to
be the only consumer of what they wrap.

Positive examples already in the repo, all of which predate this document:

- `packages/ui/wireframes/src/lib/` owns the layout-tree engine (`LayoutNode`,
  `applyIntent`), pure and property-tested; `apps/www`'s
  `use-live-layout-editor.ts` imports the type and one function.
- `packages/ui/honeycomb` is a thin React shell over the separately-published
  `@some-ui/hangul-game-core` wasm crate.

## The threshold: when a module under `apps/` should be hoisted

Hoist when **all four** hold. Fewer than four is a note in review, not a
migration.

1. **It is already pure.** No React, no router, no `@/` imports. If it is not,
   the work is to separate the pure part first - and that separation is often
   the whole win, with no hoist needed after it.
2. **It has real fan-out.** Three or more independent consumers, or one
   consumer in a different feature folder. One consumer in its own folder is
   not shared code; it is a file.
3. **It is big enough to be worth a boundary.** Roughly 150 lines or more
   including tests. Below that, the package's own config outweighs it.
4. **Its concern has a name.** "The activity catalogue", "the tenant
   repository layer". If naming the package means listing what is in it, the
   grouping is not real yet.

The counter-principle matters just as much: **do not hoist app glue.**
`use-live-layout-editor.ts` (173 lines) fails test 1 - it genuinely mixes
pure tree logic with session-mutation orchestration - and hoisting it would
move app decisions into a package where they do not belong. `live-player.tsx`
and `session-viewport.tsx` are the same. Over-hoisting is a real failure
mode, and the Doctrine's blast-radius argument is the reason: a shared export
is a promise to every consumer, paid on every future edit.

## The rule that has no threshold

**A feature folder must not import from a sibling feature folder's internal
modules.** `components/player/*` importing from `components/composer/utils`
is not a size question; it is a wrong edge, whatever the LOC. Either the
thing is shared - in which case it belongs in a package or a shared module,
and the fix is to move it - or it is not, in which case the reach is a bug.

This one is worth stating separately because it is the failure that _looks_
harmless. It costs nothing at the moment it is written and shows up later as
"why does deleting a composer file break the player?".

## Worked example: `@some-ui/activity-catalog` (#754, #852)

`apps/www/src/lib/activity-catalog/` scored the threshold cleanly: pure (no
React), fanned out to the composer, the player, the tenant repository and six
route files, ~450 lines with tests, and a nameable concern. It is now
`packages/activity-catalog`.

The hoist was done alongside #852, which needed to add ranking, fuzzy search
and fixtures to the same module - which is the useful signal to take from it.
The moment a module starts growing _new pure logic_ is the cheapest moment to
draw its boundary, and the most expensive moment to keep putting it off.

Three edges moved with it, each one an instance of a rule above:

- `summarizeConfig` moved out of `components/composer/utils` because the
  player and the sessions route were importing it from there - the wrong-edge
  rule, not the threshold.
- `AudioChannelId` moved _into_ the catalogue, because activities are where
  channels are declared and `lib/audio-preferences` is where they are
  consumed. Two modules cannot both own a vocabulary.
- `useEditModeHotkey` went to the shared utils workspace instead of a new
  package: 42 lines of `useState` plus a window listener is a hook, not a
  concern, and test 3 says so. With one consumer, it has since moved back to
  `apps/www/src/hooks`.

## Inside a React package: the component is not the coordinator

The same line runs through a `packages/ui/*` workspace, which is React by
definition. Its purity test above runs in `jsdom` and so cannot fail, and that
is how the line got crossed without anything noticing.

**React projects state and turns gestures into intents. It does not
coordinate the application.** Owning an external resource (a microphone, an
`Audio`, a socket, a database handle), sequencing I/O, and deciding which of
two racing results wins all belong to a module that would survive deleting
React. If proving the feature correct needs reasoning about renders,
dependency arrays, refs or unmount, React has become the coordination
substrate. The litmus: delete the component, and the orchestration should
still be there.

The shape, for a feature that holds anything external with an async
lifetime:

- **One state union** in `lib/`, with a pure `step(state, event)` returning
  the next state and the effects to run. Tested in `node`. States that must
  not coexist (recording and playing, say) are arms of one union, so the
  combination cannot be written down.
- **A runtime** beside it, plain TypeScript over ports (the store, the
  recorder, the clock). It owns the handles, runs the effects, decides which
  late result is stale, and has a `dispose()`.
- **A port translates.** What crosses it is ours: an adapter turns the
  platform's values (its tags, ids, booleans, errors) into this package's
  closed types, and nothing past it branches on a raw platform string or a
  collapsed flag. A translation that collapses states (to a boolean, to
  `null`) says so where it happens. `@some-ui/speech` is the example: a
  line's language is `"korean" | "english"`, a platform's tag is read only by
  `spokenLanguageOf` in an adapter or its transport, and voice availability
  is four states, not a boolean, so "still loading" never reads as "missing".
  A port whose platform answers asynchronously (a native plugin, a
  permission prompt) waits through `callForeign`: see F1 below.
- **The component** reads a snapshot (`useSyncExternalStore`) and dispatches
  events. A hook that subscribes, or an effect that forwards
  `visibilitychange` as an event, is wiring. What the event _means_ is the
  machine's.

Topik is the model: `core/session-machine` and `core/effect-executor`, with
`adapter/hooks/use-session` as the wiring. The symptoms of the other shape
are recognisable: a request or turn counter in a `useRef`, a resource handle
in a `useRef`, a `mountedRef`, several `useState`s that only make sense
together, and a comment explaining which continuation still owns what.
`packages/ui/lesson-crm` has them, and so did the soundbites page in #1636,
where 8 of 11 review findings across 7 rounds were races in exactly that
coordination, each fixed by one more local guard.

> **R1: A React module that coordinates async work says why, in the
> allowlist.**
>
> - _Claim:_ every entry in `scripts/react-coordination.allowlist` outside
>   its `Grandfathered:` group sits under a `Coordination:` line that names
>   the external work the module awaits and why that sequencing cannot live in
>   a runtime outside React; and no count in the `Grandfathered:` group is
>   higher than on `main`.
> - _Falsified by_ an allowlist hunk that adds an entry, or raises a count,
>   inside the `Grandfathered:` group; that adds an entry or raises a count
>   under a `Coordination:` line naming no external work or no reason it stays
>   in React ("needs await" and "async handler" are not reasons); or that
>   deletes or rewords a `Coordination:` line, or splits a group, so an entry
>   loses its reason. Also by a hunk to
>   `packages/eslint/src/react-coordination.ts`,
>   `scripts/check-react-coordination.ts`, the root `lint` script or pr.yml's
>   `react-coordination` job (and its line in CI Gate) that narrows what is
>   counted or stops it running: a path excluded, a kind of site dropped, a
>   step removed, a file deleted or renamed.
> - _Scope:_ `scripts/react-coordination.allowlist` and the files named
>   above.
> - _Why not enforced:_ the count is. `pnpm check:react-coordination` fails
>   any React module whose `await`, `for await`, `.then`, `.catch` and
>   `.finally` sites are not listed at exactly that number, in either
>   direction. A React module is a `.jsx`/`.tsx` file, a module whose ES
>   `import` or `export … from` names a React library (`react`, `react-dom`,
>   or a binding such as `@tanstack/react-query`), or one that declares or
>   calls a hook by the `use` + capital convention (`function useX`, a
>   variable declared `useX` with `const`, `let` or `var`, `useX()`,
>   `Namespace.useX()`), so a custom hook counts too. That syntax is the whole
>   classification. A hook renamed away from the convention, or called through
>   a lowercase object, is not counted, and is a rules-of-hooks naming problem
>   for review, not a gap in R1. Nor is CommonJS `require("react")`, which
>   nothing in scope uses. Whether those sites make the component the
>   coordinator is not decidable. Lint sees one awaited submit and nine
>   interleaved awaits over a microphone, a store and an `Audio` as the same
>   construct. Types do not help, because the problem is how hooks compose,
>   not any one signature. Tests pass either way, because behaviour is the
>   same and only the race surface differs. So the check never judges. It
>   turns every change in how much a React module coordinates into a line in
>   the diff, and that line is where this falsifier is applied, as with RS1's
>   fingerprint and the Rust side's `scripts/check-mutation-boundary.sh`.
>   "Grandfathered counts never rise" is mechanical; not yet a rule (it needs
>   the base branch's allowlist to compare against).
>
> True when declared: all 56 entries are in the `Grandfathered:` group, and
> the check passes on the tree that declares R1.

What the count does not see, so a reviewer should not expect it to: a
fire-and-forget call (`void save()`), which looks the same as a `void
navigate(...)`, and state that is coordination without awaiting anything,
such as a ref that holds a handle. Those surface as review findings instead,
and `.claude/skills/steward/SKILL.md` says what a cluster of them means.

## A port translates: the foreign boundary

A port to an API this codebase does not own has to answer four questions:
what can go wrong, how long to wait, what the person is told, and where the
real error goes. A port that answers them itself tends to skip one.
LeetType's phone dictation (#1671) skipped all four: its own three-word
failure union had no "this phone cannot", it kept no cause, and Stop had no
deadline. So on a phone whose recognizer could not start, Speak flashed
"Listening…" for one frame and printed the same small notice blaming the
speaker on every tap, logged nothing, and could hold Stop at "Finishing…"
indefinitely. About fifty unit tests passed, each against a fake recognizer
someone wrote by hand.

The answers are shared instead, in `@some-ui/intent-kit`:

- **The vocabulary** is `IntentError`: `unreachable`, `rejected`,
  `unavailable` (no retry can help, so the feature withdraws the affordance)
  and `unknown`, each with a summary for the person and the foreign `cause`
  for a developer.
- **The rules** are `callForeign({ port, deadlineMs, start })`: the outcome
  settles exactly once and never rejects; by a deadline every call must
  name; as an `IntentError` whose cause is exactly what the foreign side
  threw; reported once to the port's required `report`; and nothing the
  foreign side does after that counts. The usual `report`, `reportFailure`,
  survives a release build: www strips `console.*` calls from production
  (`build.minify.ts`), so it writes through `globalThis.console`, which the
  minifier leaves (`release-console.test.ts` minifies it as a release does
  and runs it), and hands the failure to the app's sinks: in the Android
  app, its native log (`apps/www/src/lib/native-log`, tag `SomeUI` in
  logcat), since a release WebView's console reaches nothing. `src/__tests__/foreign.test.ts`
  checks the five laws as one property over every way a foreign side can
  behave (answer or fail at any time, fail with anything, throw, never
  answer), so a port does not re-test them with its own handful of cases.
- **What stays per port** is `classify`: only the adapter knows that a
  Capacitor `code: "UNAVAILABLE"` means `unavailable`, or that a Web Speech
  `"not-allowed"` means the person said no. That mapping is finite and
  documented by the platform, which is where a port's own tests belong.

`@some-ui/speech` has its own settlement contract for speech output, which
came first and stays: its four laws are the same idea inside one package.

> **F1: A wait on a foreign API goes through `callForeign`, or says why
> not, in the allowlist.**
>
> - _Claim:_ every entry in `scripts/foreign-boundary.allowlist` outside its
>   `Grandfathered:` group sits under an `Unbounded:` line that says why that
>   wait needs no deadline, no classified failure and no report; and no
>   count in the `Grandfathered:` group is higher than on `main`.
> - _Falsified by_ an allowlist hunk that adds an entry, or raises a count,
>   inside the `Grandfathered:` group; that adds an entry or raises a count
>   under an `Unbounded:` line giving no reason a person could check ("it is
>   async" and "the plugin has no timeout" are not reasons; "best effort,
>   nobody waits on the answer, and its failure changes nothing a person
>   sees" is); or that deletes or rewords an `Unbounded:` line, or splits a
>   group, so an entry loses its reason. Also by a hunk to
>   `packages/eslint/src/foreign-boundary.ts`, `packages/eslint/src/site-count.ts`,
>   `scripts/check-foreign-boundary.ts`, the root `lint` script or pr.yml's
>   `foreign-boundary` job (and its line in CI Gate) that narrows what is
>   counted or stops it running: a foreign module or global dropped, a kind
>   of site dropped, a path excluded, a step removed, a file deleted or
>   renamed. And by a hunk to `packages/intent-kit/src/foreign.ts` that
>   weakens a law without changing `src/__tests__/foreign.test.ts` to match.
> - _Scope:_ `scripts/foreign-boundary.allowlist` and the files named above.
> - _Why not enforced:_ the count is. `pnpm check:foreign-boundary` fails any
>   source file whose waits (`await`, `for await`, `.then`/`.catch`/
>   `.finally`) on a value from a foreign API, outside the arguments of a
>   `callForeign` imported from `@some-ui/intent-kit`, are not listed at
>   exactly that number, in either direction. Foreign means imported from
>   `@capacitor/*` or `@capacitor-community/*` (statically or by `import()`),
>   the browser's `navigator` and `Notification`, and any variable
>   initialized from one of those. `fetch` is out of scope: `file_host` has
>   its own boundary (`apps/www/src/lib/intent/errors.ts` and the client's
>   deadline). Whether a given wait can hang, or fail in words a person
>   never hears, is not decidable from syntax. Types do not help, because
>   `Promise<T>` says nothing about whether it settles. A test of one port
>   covers the cases its author thought of, which is the gap F1 exists to
>   close. So the check never judges: it makes every new unbounded wait a
>   line in the diff, where this falsifier is applied. What it cannot see
>   is in `foreign-boundary.ts`'s header: a callback API wrapped in a
>   hand-made `new Promise` (Web Speech, IndexedDB), a fire-and-forget
>   call, and a foreign value reached only through a function of ours or an
>   assignment. Those are review findings. "Grandfathered counts never rise"
>   is mechanical; not yet a rule, as for R1.
>
> True when declared: 12 entries (28 waits) are in the `Grandfathered:`
> group and one is `Unbounded:` (the native log's own fire-and-forget
> write), and the check passes. Through the boundary so far: the phone's
> dictation (`apps/www/src/lib/dictation`) with the browser's
> (`packages/ui/leetype/src/lib/leetype/notes/dictation`, whose wrapped
> `new Promise` the count could not have seen), and the phone's database
> (`apps/www/src/lib/device-backend/capacitor-sqlite`).

## How this is enforced

Partly. Be honest about which parts.

- **Purity** is enforced by the package's own vitest config running in the
  `node` environment. A React import fails the tests rather than the review.
- **Deep path-alias imports** of a hoisted module are gone by construction -
  the directory no longer exists.
- **Coordination in React** is counted, not judged: R1 above, by
  `pnpm check:react-coordination` (in root `pnpm lint` and its own pr.yml job
  that CI Gate requires).
- **Waits on foreign APIs** are counted, not judged: F1 above, by
  `pnpm check:foreign-boundary` (in root `pnpm lint` and its own pr.yml job
  that CI Gate requires). The laws of the boundary itself are a property
  test in `@some-ui/intent-kit`.
- **The sibling-internals rule is not mechanized yet.** It is a review rule
  today. If it recurs, the place to put it is an `import/no-restricted-paths`
  zone in `packages/eslint`, and this paragraph is the note to that effect.
