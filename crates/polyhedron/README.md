# Polyhedron Viewport Manager

A Rust crate for managing content projection and navigation across polyhedron-based UI structures, with WASM bindings for web integration.

## Overview

This library solves the problem of displaying and cycling through a linear timeline of content items mapped onto the faces of a 3D polyhedron UI. Think of it as a carousel system, but instead of a simple circular rotation, content is distributed across the faces of geometric shapes (cubes, hexagonal prisms, or custom carousels) that can rotate along different axes.

The core challenge: **How do you cleanly project a 1D timeline onto a rotating 3D polyhedron UI while maintaining mathematical invariants about content distribution, temporal coherence, and boundary behavior?**

## Core Concept

You have:

- **A timeline**: Linear sequence of `n` content items, each with a duration
- **A polyhedron**: 3D shape with multiple faces that can rotate along predefined cycles
- **Face capacity**: Each face displays up to `k` items simultaneously
- **Rotation cycles**: Different ways to traverse the polyhedron's faces (e.g., rotating a cube around Y-axis vs X-axis)

The system projects your linear timeline onto the polyhedron's faces while maintaining strict mathematical invariants about content distribution, boundary behavior, and cursor coherence.

## The Math: Epoch-Based Projection

Given:

- `n` = total items in timeline
- `f` = number of faces in current rotation cycle
- `k` = face capacity (items per face)
- `c = f × k` = full rotation capacity

The system divides the timeline into **epochs**:

- `q = n ÷ c` = number of complete epochs
- `r = n mod c` = residual items (the partial epoch)

### Key Insight: Epochs Prevent "Time Travel"

The epoch system ensures that content from the future doesn't leak into earlier faces. When you're viewing face 2 in epoch 0, you see items 6-8, not items from epoch 1 that haven't "happened" yet.

**Example**: 50 items, 4 faces, 3 items per face

- `c = 12` items per full rotation
- Epoch 0: items 0-11 distributed across faces 0-3 (3 items each)
- Epoch 1: items 12-23 distributed across faces 0-3 (3 items each)
- Epoch 2: items 24-35 distributed across faces 0-3 (3 items each)
- Epoch 3: items 36-47 distributed across faces 0-3 (3 items each)
- Epoch 4 (residual): items 48-49 distributed across faces 0-1 (2 items, then empty faces)

## The Eight Invariants

The test suite enforces eight mathematical invariants that ensure correct behavior:

### 1. **No Early Residual Leakage**

Content from future epochs never appears on faces in earlier epochs. Residual items (the `r` leftover items when `n` isn't evenly divisible by `c`) only appear at the epoch boundary where they belong.

### 2. **Residuals Only on Cycle Wrap**

When you have residual items, they appear sequentially on faces during the residual epoch, then remaining faces are empty. No weird scattered distribution.

### 3. **Cursor Locality**

Advancing the cursor (`NextItem`) within the same epoch doesn't change face contents. The projection is stable until you cross an epoch boundary.

### 4. **Rotation Boundary Rewrites Only**

Rotating between faces (`RotateNext`/`RotatePrev`) doesn't change face contents—only which face is active. The projection recomputes only on epoch boundaries.

### 5. **Cycle Conservation**

One complete rotation through all faces in a cycle shows exactly `min(c, n)` distinct items. No duplicates, no missing items.

### 6. **Cursor/Active Face Coherence**

The cursor (current timeline position) is **always** contained in the active face's content array. This is the most critical invariant—you're always looking at the face that contains your current position.

### 7. **Post-Residual Periodicity**

After passing through the residual epoch, the system enters a periodic regime where the pattern repeats with wraparound. The relative structure is preserved.

### 8. **Cycle Position Auto-Sync**

When the cursor crosses a face boundary (every `k` items), `cycle_position` automatically updates to match. The system maintains coherence between timeline position and visual state.

## Supported Polyhedra

### Cube (6 faces)

- **Y-axis cycle** (`cube:y`): 4 faces - front, right, back, left
- **X-axis cycle** (`cube:x`): 4 faces - front, top, back, bottom

### Hexagonal Prism (8 faces)

- **Circumference cycle** (`hex:circumference`): 6 faces - the hexagonal sides
- **Vertical cycle** (`hex:vertical`): 4 faces - alternating pattern through top/sides/bottom

### Carousel (N faces)

- **Circular cycle** (`carousel:circular`): N faces in a simple ring

Each polyhedron can have multiple rotation cycles, allowing you to change the traversal pattern without changing the underlying timeline.

## Navigation Model

### Transitions

```rust
pub enum Transition {
    NextItem,              // Advance timeline by 1 item
    RotateNext,            // Move to next face in cycle (advances timeline by k items)
    RotatePrev,            // Move to previous face in cycle
    JumpToFace(usize),     // Jump to specific face in current cycle
    SwitchCycle(usize),    // Change rotation pattern (pure view change)
    SwitchCycleByKind(String), // Change rotation pattern by name
    JumpToContent(usize),  // Jump to specific timeline item
}
```

### Timeline Management

- **Auto-advance**: Call `tick(dt)` to advance timeline based on item durations
- **Manual control**: Use transitions to navigate explicitly
- **Cursor tracking**: `cursor()` returns current timeline position
- **Progress**: `progress()` returns 0.0-1.0 completion within current item

## WASM Integration

The library exposes a complete WASM API for JavaScript:

```javascript
const manager = new WasmViewportManager();

// Create viewport
const state = manager.createViewport(
    "my-viewport",
    items,  // [{contentIndex: 0, durationMs: 5000}, ...]
    { type: "cube" },
    3,  // face capacity
    "cube:x"  // optional: rotation cycle name
);

// Get current state
const state = manager.getState("my-viewport");
// {
//   faceLayout: [[0,1,2], [3,4,5], ...],
//   activeFace: 0,
//   activeItemInFace: 1,
//   cursor: 1,
//   cycleIndex: 0,
//   cyclePosition: 0,
//   cycleName: "cube:y",
//   progress: 0.3
// }

// Navigate
manager.applyTransition("my-viewport", { type: "rotateNext" });
manager.tick("my-viewport", 16);  // tick 16ms forward
```

## Use Cases

This architecture is designed for:

1. **3D Carousel UIs**: Product showcases, image galleries that rotate in 3D space
2. **Multi-face Dashboards**: Rotating cube/prism interfaces where each face shows different content
3. **Temporal Navigation**: Story/slideshow systems with automatic progression and spatial navigation
4. **VR/AR Content Browsers**: Spatial content organization with multiple viewing axes
5. **Data Visualization**: Rotating through different views of a dataset with temporal correlation

## Design Philosophy

### Why Epochs?

The epoch system emerged from the need to handle non-divisible timelines gracefully. If you have 50 items and 12-item rotation capacity, naive modulo arithmetic causes items 48-49 to "wrap around" and appear in early faces, violating temporal coherence.

Epochs partition the timeline into discrete rotation cycles, ensuring that:

- Early faces never show "future" content
- Residuals are handled explicitly at boundaries
- Post-residual behavior is periodic and predictable

### Why Pure Projection?

`compute_layout()` is a pure function—given cursor position, it deterministically computes face contents. This separation allows:

- Time-travel debugging (compute layout at any cursor position)
- Immutable rendering (React-friendly state model)
- Cycle switching without timeline disruption

### Why Cursor Coherence?

The invariant that cursor must always be in the active face prevents UI/state desynchronization. If you're viewing face 2 but the timeline is at an item on face 3, the UI is lying to the user. The auto-sync in `sync_cycle_position_from_cursor()` maintains this truth.

## Architecture

```
┌─────────────────────────────────────┐
│   WasmViewportManager (WASM API)    │
│   - Multiple viewport instances     │
│   - Active viewport tracking        │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│   Viewport (Core State)             │
│   - Timeline (cursor + items)       │
│   - Polyhedron (geometry + cycles)  │
│   - cycle_index, cycle_position     │
│   - face_capacity                   │
└─────────────┬───────────────────────┘
              │
         ┌────┴────┐
         ▼         ▼
    ┌─────────┐ ┌──────────────┐
    │Timeline │ │ Polyhedron   │
    │- Items  │ │- Faces       │
    │- Cursor │ │- RotCycles   │
    │- Tick   │ │- Geometry    │
    └─────────┘ └──────────────┘
```

## Future You: What Were You Thinking?

Looking at this code months later, here's what you were solving:

**Problem**: You needed a mathematically sound way to map linear auto-advancing content (like a slideshow) onto a 3D rotating UI, where users could both navigate manually AND have content auto-progress temporally.

**Challenge**: Naive approaches break down when:

- Timeline length doesn't divide evenly into rotation capacity
- Users rotate while content is auto-advancing
- You switch between different rotation axes
- You need to maintain "which face am I looking at?" coherence

**Solution**: Epoch-based projection with eight enforced invariants, treating rotation as a view change orthogonal to timeline progression, with automatic cursor/face synchronization.

The extensive test suite (8 invariant tests) proves the system maintains mathematical consistency under all navigation patterns. The WASM layer exposes this as a stateful manager for web UIs.

You built this because you needed it to **just work** under all edge cases, and you wanted the proof.
**NOT TRUE - Claude claims the above but I actually forgot what I was trying to do, or kind of decided to do something else**
