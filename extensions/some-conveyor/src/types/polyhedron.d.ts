/**
 * Ambient declaration for the `polyhedron` WASM package.
 *
 * wasm-bindgen emits the real .d.ts into crates/polyhedron/dist at build time,
 * which does not exist during `tsc --noEmit`. We also deliberately avoid pulling
 * in the generated glue. This mirrors only the surface WasmBridge consumes.
 */
declare module "@some-ui/polyhedron" {
  export class WasmViewportManager {
    constructor()
    createViewport(
      id: string,
      items: unknown,
      polyhedron: unknown,
      faceCapacity: number,
      cycleName?: string
    ): unknown
    getState(id: string): unknown
    applyTransition(id: string, transition: unknown): unknown
    tick(id: string, dtMs: number): boolean
    removeViewport(id: string): boolean
    listViewports(): unknown
    clear(): void
  }
  const init: (moduleOrPath?: unknown) => Promise<unknown>
  export default init
}
