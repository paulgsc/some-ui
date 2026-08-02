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

## How this is enforced

Partly. Be honest about which parts.

- **Purity** is enforced by the package's own vitest config running in the
  `node` environment. A React import fails the tests rather than the review.
- **Deep path-alias imports** of a hoisted module are gone by construction -
  the directory no longer exists.
- **The sibling-internals rule is not mechanized yet.** It is a review rule
  today. If it recurs, the place to put it is an `import/no-restricted-paths`
  zone in `packages/eslint`, and this paragraph is the note to that effect.
