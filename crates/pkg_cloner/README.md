# `pkg_cloner`

Scaffolds a new JS/TS workspace package by cloning an existing package's
configuration files. Invoked from the repo root as `pnpm build:template`.

Point it at a workspaces directory (`packages/`, `packages/ui/`, ...), pick an
existing package as the template, and name the new one. It creates
`<new-package>/src/` and copies the template's `tsconfig*.json`,
`package.json` (rewriting the `name` field), `*.config.{js,ts}`, and
lint/prettier/git/editorconfig dotfiles across.

```sh
cargo run --manifest-path crates/pkg_cloner/Cargo.toml -- --workspaces packages/ui
```

| Flag                     | Default | Meaning                                                     |
| ------------------------ | ------- | ----------------------------------------------------------- |
| `--workspaces`, `-w`     | —       | Directory holding the workspace packages (required).         |
| `--similarity-threshold` | `0.75`  | Levenshtein similarity above which a name is flagged as a near-duplicate of an existing package and confirmed before proceeding. |
| `--force`, `-f`          | `false` | Overwrite an existing package directory and skip the confirmation prompt. |

It deliberately stops at the mechanical parts. The vite-config call, the
`src/index.ts` barrel, and the three registration points (root `tsconfig.json`
paths, `packages/eslint/tsconfig.workspace-resolve.json`, and
`pnpm-workspace.yaml` if a new top-level category is involved) are still a
manual step afterwards — see
[`packages/README.md`](../../packages/README.md) §5–6.
