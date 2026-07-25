# `@some-ui/types` Composition Census

> Applies [`packages/SHARED_WORKSPACE_DOCTRINE.md`](../SHARED_WORKSPACE_DOCTRINE.md)
> to `@some-ui/types` (renamed this session from the unscoped `some-types-utils`).
> The M14 epic ([#536](https://github.com/paulgsc/some-ui/issues/536)) scopes its
> hoist/de-hoist work to `some-ui-utils` only — that epic is out of scope here —
> but this package shows the same god-file symptom the epic exists to fix:
> a handful of orthogonal domain schemas and a couple of truly generic type
> utilities, bundled into one workspace because they needed "somewhere to
> live." This census is evidence + record of what moved and why; per the
> Doctrine's own convention, a cleanup candidate is not a code move.

## Actions taken this session

| Change                                                           | Reason                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renamed `some-types-utils` → `@some-ui/types`                    | Follow the `@some-ui/*` scoped-package convention already used by `@some-ui/ws`, `@some-ui/core-utils`, etc. Updated all 8 consumer workspaces' imports and `package.json` dependency keys, plus `packages/eslint/tsconfig.workspace-resolve.json`.      |
| De-hoisted `Range` → `packages/ui/dice-card/src/types/range.ts`  | Doctrine §2: exactly one genuine consumer (`packages/ui/dice-card`'s `use-rotating-cube.ts`, aliased `Range as ValidNumbers`). De-hoist trigger fires unconditionally on a single-consumer export. Dependency removed from `dice-card`'s `package.json`. |
| Removed the `some-types-utils` dependency from `packages/ui/nfl` | Declared but never imported anywhere in that workspace - pure package.json noise, unrelated to any hoist/de-hoist decision (same category UTILS_CENSUS.md calls "declared-but-unused").                                                                  |

## Doctrine-scored assessment of what remains

### 1. The incoming-websocket-protocol cluster (now-playing, obs-websocket, orchestrator-types, utterance, incoming-events) - **keep together**

A first pass at the consumer list makes `now-playing`, `obs-websocket`, and
`utterance` look like single-consumer clusters (`packages/ui/umag` owns
now-playing/utterance; `packages/utils` owns obs-websocket) - each superficially
a de-hoist candidate under Doctrine §2.

That read is wrong. `incoming-events/index.ts` defines `IncomingEventSchema`, a
`z.discriminatedUnion` over **all four** domains' message shapes, and every real
consumer imports the union, not the standalone per-domain schema:

- `packages/utils/src/lib/hooks/socket-tenants/use-obs-socket.ts` and
  `.../orchestrator/use-orchestrator.ts`
- `packages/ui/umag/src/hooks/now-playing/use-now-playing-socket.ts` and
  `.../prompt-utterance/use-prompt-utterance.ts`

All four hooks type their `useWebSocket<IncomingEvent, ...>` call against the
same full union, not a domain-narrowed subset. De-hoisting any one domain
schema out of `@some-ui/types` would force `IncomingEventSchema` to either
duplicate that domain's shape or import it back from a leaf workspace
(`packages/utils` or `packages/ui/umag`) - an inverted, and in the two-domain
case circular, dependency. Doctrine §3 scoring for the cluster as a whole:

| Question                                                                       | Score |
| ------------------------------------------------------------------------------ | ----: |
| ≥2 genuine, independent consumers today (`packages/utils`, `packages/ui/umag`) |    +3 |
| Contract stable since inception                                                |    +2 |
| Orthogonal to the _other_ concerns in the package (polyhedron, generic utils)  |    +2 |
| Consumers span different workspaces, not sibling features of one               |    +1 |

**Total: +8 → keep hoisted**, as one unit. The individual domain schemas are
not orthogonal _to each other_ - they're deliberately co-located because they
compose into one wire protocol - so splitting them is the wrong move even
though each one's _direct_ import count looks thin in isolation. If this
cluster is ever extracted wholesale (e.g. a future `@some-ui/socket-protocol`),
it moves as this one indivisible unit, not four.

### 2. `polyhedron` (WASM viewport types) - **keep, aligns with the out-of-scope epic**

3 genuine consumers: `packages/utils`, `packages/some-content-registry`,
`packages/ui/slideshow`. Passes the defense test outright. This is also the
type-level half of epic #536's own S5 story (`@some-ui/viewport`, "owns the
crate") - when/if that workspace is created, these types are the natural thing
to migrate alongside the WASM viewport engine they describe. Not touched this
session; that migration belongs to the epic, not to this package's cleanup.

### 3. `createEnumSchema` - **dead code, cleanup candidate**

Zero consumers anywhere in the repo (checked via full-repo grep, not just this
package's declared dependents). Not a hoist/de-hoist decision - there's no
second workspace to de-hoist it _to_ - just unreachable weight. Left in place
this session since deletion wasn't requested; flagged here for a follow-up.

### 4. `is-null`, `numerical/is-number` - **dead code, cleanup candidate**

Zero consumers, and neither is even re-exported by the package's own barrel
(`src/components/index.ts`) - internal-only orphans, unreachable from outside
`@some-ui/types` even in principle. Each already has test coverage (kept as-is
this session). Same verdict as `createEnumSchema`: flagged, not removed.

## Summary

| Cluster                                                                        | Consumers                                                                       | Verdict                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------- |
| `Range`                                                                        | 1 (`packages/ui/dice-card`)                                                     | **de-hoisted this session**           |
| now-playing + obs-websocket + orchestrator-types + utterance + incoming-events | 2, as one unit (`packages/utils`, `packages/ui/umag`)                           | **keep, together**                    |
| `polyhedron`                                                                   | 3 (`packages/utils`, `packages/some-content-registry`, `packages/ui/slideshow`) | **keep**, future home is epic #536 S5 |
| `createEnumSchema`                                                             | 0                                                                               | dead code - cleanup candidate         |
| `is-null`, `numerical`                                                         | 0, unreachable via barrel                                                       | dead code - cleanup candidate         |

## Non-goals

This document moves no further code. The one move it records (`Range`) was
executed and verified (typecheck green across all 8 previously-affected
consumer workspaces) before this census was written up.
