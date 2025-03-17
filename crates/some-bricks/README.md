# Rust + WebAssembly (wasm) Project

This project compiles Rust code to WebAssembly (wasm) and generates TypeScript bindings for easy usage in a frontend environment.

## Prerequisites

Ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install) (with `wasm32-unknown-unknown` target)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) (for building the wasm package)
- [Node.js](https://nodejs.org/) and `pnpm` (or `npm`/`yarn` for package management)

## Project Setup

1. **Install wasm target for Rust:**

```sh
    rustup target add wasm32-unknown-unknown
```

2. **Build the WASM package to `dist/` directory with TypeScript bindings:**

```sh
    wasm-pack build --target web --out-dir dist
```

This will: - Generate `.wasm` and JS wrapper files in `dist/` - Include TypeScript type definitions (`.d.ts` files)

## Using the Generated Wasm Module

### In a TypeScript Project

    1. **Install dependencies:**
    ```sh
    pnpm add ./dist  # or `npm install ./dist` / `yarn add ./dist`
    ```

    2. **Import and use the module in TypeScript:**
    ```ts
    import init, { myFunction } from "my-wasm-module";

    async function run() {
        await init(); // Initialize wasm
        console.log(myFunction());
    }

run();

````

## Development Workflow

### Rebuilding the WASM Package
Whenever you modify Rust code, rebuild it using:
```sh
wasm-pack build --target bundler --out-dir dist --typescript
````

### Running in a Frontend Framework (Vite/Next.js)

If using Vite, ensure the module is properly loaded by adding:

```ts
import wasmInit from "./dist"

await wasmInit()
```

For Next.js, ensure the WebAssembly file is loaded in a client-side environment.

## Publishing the WASM Package

To publish as an npm package:

```sh
wasm-pack publish --out-dir dist
```

## Troubleshooting

- **`wasm file not found` error?** Ensure the `.wasm` file is copied correctly and referenced properly in imports.
- **ESM/CommonJS issues?** Try `wasm-pack build --target web` for a frontend-friendly build.

---

Now you're set to use Rust + Wasm with TypeScript efficiently!
