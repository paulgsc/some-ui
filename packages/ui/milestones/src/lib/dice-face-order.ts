/**
 * `@some-ui/dice-card`'s Y-axis rotation advances through physical cube
 * faces front(0) -> right(3) -> back(2) -> left(1) (see
 * `ROTATION_CYCLES["Y-axis"]` in its `use-rotating-cube` hook). Placing
 * milestone content at these physical face indices, in this sequence, means
 * stepping through milestones one at a time turns the cube by exactly one
 * physical step instead of a shortcut diagonal across it.
 */
export const Y_AXIS_FACE_SEQUENCE = [0, 3, 2, 1] as const

/**
 * The X-axis equivalent: front(0) -> bottom(5) -> back(2) -> top(4) (see
 * `ROTATION_CYCLES["X-axis"]` in the same hook). Used by the grid cells,
 * whose cards tumble on the other axis so the wall doesn't read as one
 * repeated animation.
 */
export const X_AXIS_FACE_SEQUENCE = [0, 5, 2, 4] as const
