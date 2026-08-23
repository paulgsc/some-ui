/**
 * `@some-ui/dice-card`'s Y-axis rotation advances through physical cube
 * faces front(0) -> right(3) -> back(2) -> left(1) (see
 * `ROTATION_CYCLES["Y-axis"]` in its `use-rotating-cube` hook). Placing
 * milestone content at these physical face indices, in this sequence, means
 * stepping through milestones one at a time turns the cube by exactly one
 * physical step instead of a shortcut diagonal across it.
 */
export const Y_AXIS_FACE_SEQUENCE = [0, 3, 2, 1] as const
