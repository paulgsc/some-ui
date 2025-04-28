
---

# HexGrid Optimization Plan

> 🎯 **Problem**:  
> Build a HexGrid that supports **fast lookups**, **fast batch updates**, **fast batch coloring**, **without rescanning** the entire grid. Must handle **large N** (1000s+ cells) for real-time rendering/animation.

---

## 📈 1. First principle: Lookups must be O(1)

**Requirement**:  
Given a `CubeCoord`, lookup the corresponding `HexCell` in O(1) time.

**Data structure**:  
- `HashMap<CubeCoord, HexCell>`

**Why**:  
- HashMap lookup on integers (x, y, z) is amortized O(1).
- You can use `CubeCoord` as key by deriving `Hash`, `Eq`, and `PartialEq`.

**Test**:
- Insert 10,000 random cells and benchmark:  
  `.get(&coord)` must be **under 1μs** average time.

**If HashMap still slow**:
- Consider `FxHashMap` (Rust's fast non-cryptographic hash map).
- Consider custom packing `CubeCoord` into a single `i64` for faster hashing.

---

## ⚡ 2. Batch Updates must be O(K) for K updates

**Requirement**:  
Given a list of coordinates and new values, update K cells **without scanning N**.

**Data structure**:  
- Bulk `.get_mut()` over list of keys.

**Algorithm**:
```rust
for (coord, new_value) in updates.iter() {
    if let Some(cell) = self.cells.get_mut(coord) {
        cell.color = Some(*new_value);
    }
}
```

**Expected complexity**:
- O(K) where K = number of updates.
- No dependence on N (total grid size).

**Test**:
- Update 5000 cells in a 10,000 cell grid:  
  **Should complete under a few ms** (depending on CPU).

---

## 🌈 3. Pattern Coloring must be Algebraic

**Requirement**:  
To color a *pattern* (e.g., team logo, milestone), you should **compute affected cells mathematically** — **not** by iterating the whole grid.

**Algorithm candidates**:
- Precompute a "pattern mask" based on CubeCoords relative to origin.
- Only generate a list of "pattern coords" and apply coloring to that list.

**Example** (simple hexagon ring):
```rust
fn hex_ring(center: CubeCoord, radius: i32) -> Vec<CubeCoord> {
    // BFS or marching algorithm to collect coords at radius distance
}
```

**Expected complexity**:
- O(pattern size K), **not** O(N).

**Test**:
- Coloring a ring of 100 cells in a 5000 cell grid should be O(100) work.

---

## 🎞️ 4. Animation State must be Separate and Sparse

**Requirement**:  
Animations (temporary color changes, glows) must **not mutate** the base grid.
Only maintain a **sparse overlay** of animated cells.

**Data structure**:
- `HashMap<CubeCoord, AnimationOverlay>`

**Algorithm**:
- When rendering:  
  Final color = AnimationOverlay color if present, else base color.

**Expected complexity**:
- O(K) where K = animated cells, not N.

**Test**:
- 1000 animated cells out of 10,000 total grid → work proportional to 1000.

---

## 📦 5. Grid Construction must avoid naive iteration

**Requirement**:  
Generating a hexagon-shaped grid must be fast (O(N)), not nested loops.

**Better algorithm**:
```rust
for x in -size..=size {
    for y in -size..=size {
        let z = -x - y;
        if in_bounds(x, y, z, size) {
            add_cell(CubeCoord {x, y, z});
        }
    }
}
```
(you only accept coordinates where |x|, |y|, |z| ≤ size)

**Expected complexity**:
- O(N), where N ≈ 3 * size².

**Test**:
- For radius = 50 (~7500 cells), should build in <100ms.

---

## 🛠️ Summary Table

| Task                     | Target Complexity | Notes |
|:-------------------------|:-------------------|:------|
| Lookup single cell        | O(1)                | HashMap |
| Batch update K cells      | O(K)                | Direct lookup |
| Apply pattern to K cells  | O(K)                | Precompute pattern |
| Render with animations    | O(K)                | Sparse overlay |
| Build grid (radius R)     | O(R²)               | No wasted iterations |

---

## 🧠 Mindset moving forward

- **No grid-wide scans unless absolutely necessary**.
- **Everything driven by specific coordinate lists** (patterns, updates, animations).
- **HashMap everywhere** unless bottlenecked (then `FxHashMap` or custom key compression).

---

## 🧹 Future Optimizations (only if needed)

- Memory layout optimization (e.g., use arrays for dense grids).
- Spatial partitioning for large grids (quad-tree style overlays).
- Parallel batch updates (with `rayon` or WASM threads).

---

# TL;DR
✔️ Ready to paste into `README.md` now  
✔️ GitHub will render perfectly  
✔️ IDEs will render perfectly  

---


