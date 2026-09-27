# How a library builds

Every library that uses `createViteConfig` builds with the same script:

```jsonc
"build": "tsc -p tsconfig.build.json && vite build"
```

One TypeScript program, then one bundle:

| Step                         | What it does                                                                                          | Fails the build on               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `tsc -p tsconfig.build.json` | Type-checks the library and writes its `.d.ts` files to `dist/types`                                  | any type error                   |
| `vite build`                 | Bundles `src/index.ts` to `dist/<packageName>.es.js`, then publishes `tsc`'s declarations (see below) | a broken assumption, named below |

`tsconfig.build.json`'s `include`/`exclude` is the single source of truth for
what gets checked and what gets declared. They are one program, so there is
no second exclude list to keep in sync.

## Why one pass

The declarations used to come from `vite-plugin-dts` inside
`vite build`. It built its own TypeScript program over the same files `tsc`
had just checked: 89-93% of every `vite build`, and on a slow machine ~50 s
per library, twice, once per output format. It also printed type errors and
exited 0, so `tsc` was the only real gate anyway.

Two more things came out of that measurement:

- **ESM only.** Every library is `"type": "module"` and private, and nothing in
  the workspace `require()`s one, so the CommonJS bundle was built for no
  consumer. `formats` still accepts `"cjs"` for a library that needs it.
- **`vite-plugin-dts` was quietly wrong for chat and slideshow.** Both map
  `"@some-ui/*"` to their assets directory, and the plugin applied that alias
  to real package imports (`@some-ui/shared`), writing paths that don't exist.
  Consumers saw `any` in place of those types.

## What `some-ui:declarations` does

`src/lib/declarations.ts` has the full contract (intent, steps, assumptions
A1-A7, each checked at build time). In short:

1. Vite would empty `dist/` before bundling and delete `tsc`'s output, so the
   plugin turns `emptyOutDir` off and clears `dist/` itself, keeping
   `dist/types`.
2. `tsc` leaves `paths` aliases (`@topik/lib/topik`) as written, and a consumer
   can't resolve them: under `skipLibCheck` they silently become `any`. The
   plugin rewrites each alias TypeScript actually used into a relative `.js`
   specifier to the emitted declaration.
3. It writes `dist/<packageName>.d.ts`, the file every `package.json` `types`
   field points at, re-exporting the entry's declaration.

## What every `tsconfig.build.json` sets

```jsonc
"compilerOptions": {
  "noEmit": false,
  "declaration": true,
  "emitDeclarationOnly": true,
  "declarationDir": "./dist/types",
  "incremental": true,
  "tsBuildInfoFile": "./dist/types/tsconfig.build.tsbuildinfo",
  "rootDir": "..." // explicit, as before
}
```

`tsBuildInfoFile` has to live inside `dist/types`. `tsc -p` trusts its build
info and doesn't check that the files it lists still exist. With the build
info kept elsewhere, deleting `dist/` meant the next `tsc` emitted nothing. The
plugin refuses a config that breaks any of these, and says which setting.

## Running `vite build` alone

Don't: it publishes whatever `dist/types` holds. If that is missing the build
fails and tells you to run `tsc` first. If it is stale from an earlier run,
nothing detects it (assumption A1). The build script and turbo always run
both steps.
