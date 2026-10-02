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
- `packages/utils`'s `orchestrator-store.ts` owns the FSM;
  `apps/www/src/providers/orchestrator.tsx` is a 19-line wrapper.
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
- `useEditModeHotkey` went to `packages/utils` instead of a new package: 42
  lines of `useState` plus a window listener is a hook, not a concern, and
  test 3 says so.

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
>   direction. A React module is a `.jsx`/`.tsx` file, a module importing a
>   React library (`react`, `react-dom`, or a binding such as
>   `@tanstack/react-query`), or one that declares or calls a `use` + capital
>   hook, so a custom hook counts however it reaches React. Whether those
>   sites make the component the coordinator is not decidable. Lint sees one
>   awaited submit and nine interleaved awaits over a microphone, a store and
>   an `Audio` as the same construct. Types do not help, because the problem
>   is how hooks compose, not any one signature. Tests pass either way,
>   because behaviour is the same and only the race surface differs. So the
>   check never judges. It turns every change in how much a React module
>   coordinates into a line in the diff, and that line is where this falsifier
>   is applied, as with RS1's fingerprint and the Rust side's
>   `scripts/check-mutation-boundary.sh`. "Grandfathered counts never rise" is
>   mechanical; not yet a rule (it needs the base branch's allowlist to
>   compare against).
>
> True when declared: all 56 entries are in the `Grandfathered:` group, and
> the check passes on the tree that declares R1.

What the count does not see, so a reviewer should not expect it to: a
fire-and-forget call (`void save()`), which looks the same as a `void
navigate(...)`, and state that is coordination without awaiting anything,
such as a ref that holds a handle. Those surface as review findings instead,
and `.claude/skills/steward/SKILL.md` says what a cluster of them means.

## How this is enforced

Partly. Be honest about which parts.

- **Purity** is enforced by the package's own vitest config running in the
  `node` environment. A React import fails the tests rather than the review.
- **Deep path-alias imports** of a hoisted module are gone by construction -
  the directory no longer exists.
- **Coordination in React** is counted, not judged: R1 above, by
  `pnpm check:react-coordination` (in root `pnpm lint` and its own pr.yml job
  that CI Gate requires).
- **The sibling-internals rule is not mechanized yet.** It is a review rule
  today. If it recurs, the place to put it is an `import/no-restricted-paths`
  zone in `packages/eslint`, and this paragraph is the note to that effect.
