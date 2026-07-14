// The published @some-ui/{leetype-wasm,some-crossword,viewport-rotation}@0.0.3
// ship their wasm-pack `dist/*.d.ts`, but their package.json "types" points at a
// nonexistent `index.d.ts`, so TypeScript can't find the declarations and every
// import resolves to `any` (TS7016). The root cause is fixed for future
// publishes in crates/*/package.json; this re-exports the real, already-shipped
// declarations so consumers resolve types against the installed 0.0.3 today.
// Remove once a corrected version is published and adopted.
//
// wasm-pack modules have a default export (the `__wbg_init` loader) plus named
// exports, so both are re-exported.
declare module "@some-ui/leetype-wasm" {
  export * from "@some-ui/leetype-wasm/dist/leetype_wasm"
  export { default } from "@some-ui/leetype-wasm/dist/leetype_wasm"
}
declare module "@some-ui/some-crossword" {
  export * from "@some-ui/some-crossword/dist/some_crossword"
  export { default } from "@some-ui/some-crossword/dist/some_crossword"
}
declare module "@some-ui/viewport-rotation" {
  export * from "@some-ui/viewport-rotation/dist/viewport_rotation"
  export { default } from "@some-ui/viewport-rotation/dist/viewport_rotation"
}
