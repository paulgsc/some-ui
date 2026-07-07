// Test-only stand-in for the `viewport-rotation` wasm-bindgen crate, which
// is only resolvable after `wasm-pack build` (crates/viewport-rotation) has
// produced its dist/ output. Individual test files override this via
// `vi.mock("viewport-rotation", ...)`; this stub exists purely so the bare
// specifier resolves during transform.
export default async function init(): Promise<void> {}

export class ViewportManager {
  reset(): void {}
  create_viewport(
    _viewId: string,
    _totalItems: number,
    _maxPerFace: number
  ): unknown {
    return {}
  }
  list_viewports(): unknown {
    return []
  }
  set_active_viewport(_direction: string): unknown {
    return {}
  }
  set_viewport_rotation_axis(_direction: string, _axisJson: string): unknown {
    return {}
  }
  rotate_viewport_next(_direction: string): unknown {
    return {}
  }
  viewport_next_item(_direction: string): unknown {
    return {}
  }
  get_viewport_current_item_index(_direction: string): number {
    return 0
  }
  get_viewport_face_indices(_direction: string, _faceIndex: number): unknown {
    return []
  }
}
