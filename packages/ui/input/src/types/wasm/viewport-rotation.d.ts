// Hand-written stand-in for the wasm-bindgen-generated declarations that
// `wasm-pack build` (crates/viewport-rotation) would normally emit into its
// dist output. Resolved via the "@some-ui/viewport-rotation" tsconfig path
// mapping so the ESLint/TS resolver has a real file to point at without
// requiring a WASM build. Only the members imported in this workspace are
// declared; full binding-accurate typing is tracked separately.

declare const init: () => Promise<void>
export default init

export class ViewportManager {
  constructor()
  reset(): void
  create_viewport(
    viewId: string,
    totalItems: number,
    maxPerFace: number
  ): unknown
  list_viewports(): unknown
  set_active_viewport(direction: string): unknown
  set_viewport_rotation_axis(direction: string, axisJson: string): unknown
  rotate_viewport_next(direction: string): unknown
  viewport_next_item(direction: string): unknown
  get_viewport_current_item_index(direction: string): number
  get_viewport_face_indices(direction: string, faceIndex: number): unknown
}
