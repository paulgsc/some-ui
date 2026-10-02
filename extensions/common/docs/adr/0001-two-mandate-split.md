# ADR 0001 — Two-mandate split: hoist contract, keep application local

- **Status:** Accepted
- **Date:** 2026-06-23
- **Refs:** [CMN-KB #271](https://github.com/paulgsc/some-ui/issues/271)

## Context

As the number of extension workspaces grows, two forces pull in opposite directions. Shared code reduces duplication but creates blast-radius coupling: a change to one workspace's shared module can break a different workspace's runtime. Completely isolated workspaces eliminate coupling but cause every workspace to reinvent keybinding matchers, storage migration patterns, shadow DOM isolation, and disposable registries independently — accumulating divergent slop.

## Decision

Hoist the **contract and typestate** (types, pure functions, invariants) into `@some-extension/common`. Keep the **application** (handlers, adapters, side effects) isolated per workspace. Enforce the shared idioms via `maishatu-eslint-kit` lint rules rather than shared runtime code where possible.

Five governance classes are recognised:
1. **Typestate** — shared types and pure transition functions; imported by path.
2. **Primitive** — reference implementations (ShadowHost, PageMonitor, DisposableRegistry); imported by path.
3. **Lint rule** — enforced at `maishatu-eslint-kit` level; workspaces must not install their own rule that contradicts it.
4. **Migration** — `MigrationLedger` instances are per-workspace, isolated, and namespaced; the class itself is shared.
5. **Copy-inline reference** — pure utility encyclopedia (CMN-UTILS); the value is the documented rationale, not the code; copy inline, do not path-import.

## Trade-offs accepted

- Workspaces must import from `@some-extension/common` instead of copy-pasting — introduces a build-time dependency.
- Lint enforcement requires every workspace to configure `maishatu-eslint-kit`; new workspaces must opt in.

## Alternatives rejected

- **Full monolith (one shared runtime):** rejected because a bug in the shared runtime breaks every extension simultaneously.
- **Full isolation (no commons):** rejected because we already observed the reinvention cost empirically (three independent keybinding matchers, two independent fullscreen watchers, etc.).
