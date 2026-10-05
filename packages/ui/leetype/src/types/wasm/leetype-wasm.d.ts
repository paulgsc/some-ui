// Stand-in module for "@some-ui/leetype-wasm", resolved via the tsconfig
// path mapping so the ESLint/TS resolver and Vitest have a real file to
// point at without instantiating the binary. Only the members imported in
// this workspace are declared.
//
// Every member is *derived* from the published declarations (by subpath,
// since the bare specifier maps back here), never from the hand-written
// surface in types/leetype.ts, which would make the check circular. See
// ./bindings-contract.ts.
//
// `import type` is erased entirely, so this file still emits nothing at
// runtime and Vitest still sees an empty module to `vi.mock` over.
import type {
  classify_source as generatedClassifySource,
  default as generatedInit,
  rendered_source as generatedRenderedSource,
  slot_map_from_source as generatedSlotMapFromSource,
  TypingGame as GeneratedTypingGame,
} from "@some-ui/leetype-wasm/dist/leetype_wasm"

declare const init: typeof generatedInit
export default init

export declare const TypingGame: typeof GeneratedTypingGame
export declare const classify_source: typeof generatedClassifySource
export declare const slot_map_from_source: typeof generatedSlotMapFromSource
export declare const rendered_source: typeof generatedRenderedSource
