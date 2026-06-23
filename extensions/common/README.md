# `@some-extension/common`

Shared commons for the browser-extension workspaces in this monorepo
(`some-filter`, `some-censor`, `some-drama`, `some-conveyor`, `some-mujik`, and
growing).

## The two mandates

Everything in this package exists to balance two forces that pull in opposite
directions:

1. **Disjointness** — a diff in one workspace must never produce an unexpected
   bug in some nth workspace. We never want the fear CSS creates.
2. **No reinvention** — we must not keep reinventing hacky slop that creates
   collisions and complexity.

The balance: **hoist the *contract* and the *typestate* here; keep the
*application* isolated per workspace; enforce the idioms with a shared linter
([`maishatu-eslint-kit`](../../packages/eslint)) rather than a shared runtime.**

## 📜 The Good-Citizen Charter

**[`GOOD_CITIZEN.md`](./GOOD_CITIZEN.md) is the canonical reference for every
extension workspace.** A browser extension is a *guest runtime executing inside
a host-owned environment* — read it before touching any content script. The
[Extension Commons](https://github.com/paulgsc/some-ui/labels/commons) epics
exist to uphold it.

## Governance — how each idiom is upheld

| Idiom | Shared as… | Where |
| ----- | ---------- | ----- |
| Commands / keybindings | shared **typestate** (one definition) | `@some-extension/common` |
| Isolation, fullscreen, disposal, attention | shared **primitives** (reference impls) | `@some-extension/common` |
| Namespacing, storage, z-index, logic-purity | shared **lint rules** (per-workspace config) | [`maishatu-eslint-kit`](../../packages/eslint) |
| Schema changes from any of the above | **per-workspace, isolated migrations** | each workspace's migration ledger |

Migrations are namespaced per workspace: workspace `w` may have applied `m`
migrations while `u` has applied `n`; the counters are independent and a
migration must never touch another workspace's namespace. See the Charter's
"Migrations are per-workspace and isolated" section.

## Contents

- [`GOOD_CITIZEN.md`](./GOOD_CITIZEN.md) — the charter (start here).
- `src/lib/layers.ts` — overlay-root / page-layer helpers (`getOverlayRoot`,
  `EXT_ATTR`); being reconciled with the shared `ShadowHost` + z-index policy.
