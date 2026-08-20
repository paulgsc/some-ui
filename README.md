# some-ui

`some-ui` is a personal product monorepo: one home for a web application,
browser extensions, reusable UI and domain packages, and the Rust/WebAssembly
engines that support them.

The repository is intentionally broad. It keeps experiments close to the
shared code that lets them survive, but it should not require prior knowledge
of the whole tree to understand one project. This README is the map; each
workspace's `README.md`, manifest, tests, and source are its local boundary.

## Choose an entry point

You do **not** need to understand every workspace before exploring one.

| If you want to…                               | Start here                    | Run it in isolation                        |
| --------------------------------------------- | ----------------------------- | ------------------------------------------ |
| Explore the main web experience               | [`apps/www`](apps/www)        | `pnpm --filter www dev`                    |
| Work on a browser extension                   | [`extensions/`](extensions)   | `pnpm --filter @some-extension/<name> dev` |
| Explore a UI activity or component            | [`packages/ui/`](packages/ui) | `pnpm --filter <package-name> test`        |
| Find reusable domain and infrastructure code  | [`packages/`](packages)       | `pnpm --filter <package-name> test`        |
| Work on a Rust or WebAssembly engine          | [`crates/`](crates)           | `cargo test -p <crate-name>`               |
| Understand the learning model and constraints | [`docs/canon`](docs/canon)    | `pnpm --filter @some-ui/canon canon:build` |
| Read design notes and decision records        | [`docs/`](docs)               | Follow the README nearest the feature      |

Replace placeholders with the `name` in the target's `package.json` or
`Cargo.toml`. For example:

```bash
pnpm --filter @some-ui/leetype test
pnpm --filter @some-extension/filter dev
cargo test -p leetype_wasm
```

The filter is the escape hatch from “monorepo means run everything”: most
development, testing, and builds can stay scoped to the workspace being
changed.

## Repository map

```text
some-ui/
├── apps/
│   └── www/              main Vite/React application and app-specific wiring
├── extensions/           independently runnable browser extensions
│   ├── common/           shared extension build/runtime support
│   └── transport/        framework-neutral extension transport kernel
├── packages/
│   ├── ui/               feature-level UI workspaces and activities
│   ├── some-content/     assets and data (not orchestration)
│   └── */                shared domain, tooling, config, and utility packages
├── crates/               Rust crates, including browser-facing WASM engines
├── content/              site-level authored content
├── docs/                 architecture notes, decision records, and canons
├── pedagogy/             learning concepts, challenges, and contributor guides
├── infra/                composable deployment definitions
└── scripts/              repository-wide build and maintenance automation
```

### What belongs where?

- **`apps/` composes; `packages/` provides.** App-specific routes, providers,
  and framework wiring stay in the app. Reusable, independently testable logic
  belongs in a package. The full test for this boundary is in
  [`docs/monorepo-boundaries.md`](docs/monorepo-boundaries.md).
- **`packages/ui/` contains product-sized UI workspaces**, not one undifferentiated
  component library. Treat each directory as a project with its own public API.
- **`extensions/` contains separate products.** Shared extension machinery
  lives in `extensions/common` or a deliberately shared package; an extension's
  feature code remains local to it.
- **`crates/` owns native/WASM engines.** Some crates also have a `package.json`
  because pnpm/Turbo builds and distributes their browser artifacts. Cargo
  remains the source of truth for Rust workspace membership.
- **`docs/canon/` is normative.** A workspace that calls itself canon-governed
  links to the relevant document in its local README. Read that citation before
  changing behavior; these files are constraints, not general background.

For shared-code extraction rules and concrete examples, read the
[`package/adapter boundary`](docs/monorepo-boundaries.md). For package creation
and shared-workspace policy, continue with [`packages/README.md`](packages/README.md).

## Getting started

### Prerequisites

- Node.js matching [`.nvmrc`](.nvmrc)
- pnpm `11.20.0` (declared in [`package.json`](package.json))
- Rust stable for work under `crates/`
- `wasm-pack` when building a browser-facing Rust crate

### Install and run

```bash
git clone https://github.com/paulgsc/some-ui.git
cd some-ui

# With nvm; use your version manager's equivalent if different.
nvm use
corepack enable
pnpm install

# Run all development tasks, or prefer the scoped form below.
pnpm dev
pnpm --filter www dev
```

`pnpm dev` starts Turbo's development graph and is useful when changes span
workspaces. A filtered command is usually the faster, quieter choice when
working on one project.

## Common workflows

### Work on one workspace

```bash
# Discover exact workspace names.
pnpm list --recursive --depth -1

# Run scripts only for one workspace.
pnpm --filter @some-ui/intent-kit test
pnpm --filter @some-ui/intent-kit typecheck
pnpm --filter @some-ui/intent-kit build

# Include that workspace and its dependencies when needed.
pnpm --filter @some-ui/intent-kit... build
```

Run `pnpm --filter <name> run` to see the scripts a workspace actually exposes.
Not every leaf has every root-level script.

### Run repository-wide checks

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --workspace
```

The JavaScript/TypeScript graph uses pnpm workspaces and Turbo. The Rust graph
uses Cargo. Root commands are intentionally broad; use them before integrating
a cross-cutting change, not as the default feedback loop for every leaf edit.

### Follow a dependency

Workspace dependencies are ordinary manifest edges:

1. Open the target workspace's `package.json`.
2. Look for `workspace:*` dependencies to find local collaborators.
3. Open the dependency's `src/index.ts` (or its documented export) rather than
   reaching into internal paths.
4. Use `pnpm --filter <name>... build` when the dependency chain must be built
   together.

For Rust, start with the crate's `Cargo.toml` and the root
[`Cargo.toml`](Cargo.toml).

## How to read a project in this monorepo

When arriving at an unfamiliar workspace, use this order:

1. **Local README** — purpose, invariants, and decisions, when present.
2. **Manifest** — exact package name, commands, entry points, and dependencies.
3. **Public entry point** — usually `src/index.ts`, `src/main.tsx`, or `src/lib.rs`.
4. **Tests** — executable examples and boundary expectations.
5. **Linked decision records/canons** — rationale and behavioral constraints.

If a workspace lacks a local README, its manifest and public entry point are
the authoritative starting points. That absence is also a useful signal: do
not infer that a neighboring project's documentation applies to it.

## Monorepo navigation principles

The repository reduces discovery cost through a few explicit conventions:

1. **Folders communicate deployment boundaries.** Apps and extensions run;
   packages are consumed; crates compile engines; docs explain decisions.
2. **Manifests provide identity.** Commands use package names, not memorized
   paths.
3. **Local documentation beats a giant central catalogue.** This README tells
   you where to enter; leaf READMEs explain how a workspace works and evolve
   with it.
4. **Dependency edges beat implicit proximity.** Being next to another folder
   does not make its internals public. Imports and manifests describe the real
   architecture.
5. **Scoped commands preserve isolation.** A canonical repository does not
   require a canonical feedback loop; test and run the smallest relevant
   workspace first.

These conventions are the answer to the monorepo tradeoff: keep one canonical
home, while making each project legible and operable without loading the rest
of the repository into working memory.

## License

[MIT](LICENSE)
