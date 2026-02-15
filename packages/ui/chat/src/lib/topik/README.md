# Session State Machine Architecture

## Overview

This is a **framework-agnostic** session state machine implementation following the Actor Model pattern. The core logic is pure TypeScript and can run in Node.js, Deno, Bun, or the browser. React is just a thin adapter layer.

## Architecture Principles

### 1. Separation of Concerns

```
┌──────────────────────────────────────┐
│         Core Layer (Pure TS)         │
│  - State types                       │
│  - Reducer (pure functions)          │
│  - Repository interface              │
│  - Machine (actor)                   │
└──────────────────┬───────────────────┘
                   │
┌──────────────────▼───────────────────┐
│      Runtime Layer (Environment)     │
│  - Effect executor                   │
│  - Timer management                  │
│  - Async operations                  │
└──────────────────┬───────────────────┘
                   │
┌──────────────────▼───────────────────┐
│       Adapter Layer (React)          │
│  - useSessionMachine hook            │
│  - Component integration             │
└──────────────────────────────────────┘
```

### 2. Data Management

**Problem**: Large batch files (potentially MBs) should not live in React state.

**Solution**: Separate control state from data payload:

- **Control State** (in FSM): O(1) metadata, cursors, flags
- **Data Payload** (in Repository): Full batch content, lazy access

```typescript
// ❌ BAD: State owns data
state = {
  batches: ConversationBatch[]  // Could be 10MB+
}

// ✅ GOOD: State references data
state = {
  dataRef: {
    topikKey: "topik-01",
    batchCount: 5,
    currentBatchMeta: { messageCount: 10, questionCount: 5 }
  }
}
```

### 3. Idempotent Hydration

**Problem**: Component remounts trigger duplicate fetches.

**Solution**: Repository-level caching with session persistence:

```typescript
// First mount
repository.load("topik-01") // → Fetch from network

// Remount
repository.load("topik-01") // → Return cached (V5)

// Hard refresh
repository.load("topik-01") // → New cache, fetch again

// Manual reload
repository.invalidate("topik-01")
repository.load("topik-01") // → Fetch from network
```

### 4. Pure Reducer Pattern

The reducer is **pure** and **deterministic**:

- No I/O operations
- No side effects
- No timer mutations
- No async operations

Instead, it returns **effects** that the runtime executes:

```typescript
function reducer(state, event): { state; effects } {
  // Pure state transition
  const newState = { ...state, phase: "active" }

  // Emit effects for runtime to execute
  const effects = [
    { type: "LOAD_TOPIK", key: "topik-01" },
    { type: "START_TIMER" },
  ]

  return { state: newState, effects }
}
```

### 5. Race Condition Safety

**Problem**: User selects topik-01, then immediately selects topik-02. If topik-01's response arrives after topik-02's, state becomes corrupted.

**Solution**: Key-based response validation:

```typescript
// V8: Out-of-order response safety
if (event.type === "HYDRATION_SUCCESS") {
  // Only accept if key matches current topik
  if (event.key !== state.dataRef.topikKey) {
    return unchanged() // Ignore stale response
  }

  return { state: newState, effects: [] }
}
```

## Module Structure

### Core Modules (Framework-Agnostic)

1. **session-types.ts**
   - Type definitions
   - Event algebra
   - Interface contracts
   - **0 dependencies** on React/DOM

2. **session-reducer.ts**
   - Pure state transitions
   - Cursor validation
   - Bounds checking
   - **0 side effects**

3. **topik-repository.ts**
   - Data caching layer
   - Idempotent loading
   - Metadata extraction
   - **0 React dependencies**

4. **session-machine.ts**
   - Actor implementation
   - State management
   - Subscription system
   - **0 React dependencies**

5. **effect-executor.ts**
   - Side effect orchestration
   - Async handling
   - Timer management
   - **0 React dependencies**

6. **session-selectors.ts**
   - State accessors
   - Action creators
   - Repository helpers
   - **0 React dependencies**

### Adapter Modules (React Integration)

7. **use-session-machine.ts**
   - React hook
   - State synchronization
   - Effect wiring
   - **Only React dependency**

## Usage Examples

### Pure Node.js (No React)

```typescript
import { createEffectExecutor } from "./effect-executor"
import { createSessionMachine } from "./session-machine"
import { actions } from "./session-selectors"
import { createTopikRepository } from "./topik-repository"

// 1. Create repository
const repository = createTopikRepository(
  "https://api.example.com/topiks",
  TopikFileSchema
)

// 2. Create machine
const machine = createSessionMachine(repository)

// 3. Create executor
const executor = createEffectExecutor({
  machine,
  repository,
  onBatchComplete: (idx) => console.log(`Batch ${idx} done`),
  onSessionComplete: () => console.log("Session complete!"),
})

// 4. Subscribe to changes
machine.subscribe((state) => {
  console.log("Phase:", state.phase)
})

// 5. Dispatch events
let effects = machine.dispatch(actions.selectTopik("topik-01"))
executor.execute(effects)

effects = machine.dispatch(actions.startChat())
executor.execute(effects)

// 6. Cleanup
executor.destroy()
machine.destroy()
```

### React Integration

```typescript
import { useSessionMachine } from "./use-session-machine"
import { createTopikRepository } from "./topik-repository"
import { actions, selectors } from "./session-selectors"

// Create repository once (module-level or context)
const repository = createTopikRepository("/data/topiks", TopikFileSchema)

function StudySession() {
  const { state, dispatch, machine } = useSessionMachine({
    repository,
    onBatchComplete: (idx) => console.log(`Batch ${idx} complete`),
    onSessionComplete: () => console.log("All done!"),
  })

  return (
    <div>
      <h1>Phase: {state.phase}</h1>

      {state.phase === "selecting" && (
        <button onClick={() => dispatch(actions.selectTopik("topik-01"))}>
          Select Topik 01
        </button>
      )}

      {selectors.isInChat(state) && (
        <button onClick={() => dispatch(actions.pauseChat())}>
          Pause
        </button>
      )}

      {selectors.isInQuiz(state) && (
        <button onClick={() => dispatch(actions.submitAnswer(true, "Answer"))}>
          Submit Answer
        </button>
      )}
    </div>
  )
}
```

## Invariants Enforced

The implementation enforces these critical invariants:

### Memory & Scale (V1, V12, V13)

- ✅ FSM state is O(1) w.r.t batch payload size
- ✅ State contains only metadata, not full batches
- ✅ Repository provides lazy access to data

### Determinism (V2, V3, V11)

- ✅ Reducer is pure (no I/O, no mutations)
- ✅ All transitions are explicit (no auto-progression)
- ✅ Only defined transitions allowed

### Lifecycle (V5, V6, V7)

- ✅ Hydration is idempotent per key
- ✅ Remounts don't trigger reloads
- ✅ Invalidation is explicit only

### Concurrency (V8, V9)

- ✅ Out-of-order responses handled safely
- ✅ Duplicate events are idempotent

### Safety (V10, V17, V18, V20)

- ✅ Cursor bounds validated
- ✅ Forward progress maintained
- ✅ Terminal state is stable
- ✅ No silent data loss

## Testing Strategy

### Unit Tests (Core)

```typescript
import { createInitialState, sessionReducer } from "./session-reducer"
import { actions } from "./session-selectors"

test("V2: Reducer is pure", () => {
  const state = createInitialState()
  const { state: newState } = sessionReducer(state, actions.selectTopik("test"))

  // Should not mutate original
  expect(state).not.toBe(newState)
  expect(state.phase).toBe("selecting")
  expect(newState.phase).toBe("hydrating")
})

test("V8: Out-of-order responses ignored", () => {
  let state = createInitialState()

  // Select topik-01
  ;({ state } = sessionReducer(state, actions.selectTopik("topik-01")))

  // Change to topik-02
  ;({ state } = sessionReducer(state, actions.changeTopik()))
  ;({ state } = sessionReducer(state, actions.selectTopik("topik-02")))

  // Stale response for topik-01 arrives
  const { state: after } = sessionReducer(state, {
    type: "HYDRATION_SUCCESS",
    key: "topik-01",
    batchCount: 5,
  })

  // Should be ignored - state unchanged
  expect(after).toBe(state)
})
```

### Integration Tests (Node.js)

```typescript
test("V5: Idempotent loading", async () => {
  const repository = createMockRepository()
  const machine = createSessionMachine(repository)

  // First load
  machine.dispatch(actions.selectTopik("test"))
  await waitFor(() => machine.getState().phase === "active")

  const loadCount1 = repository.getLoadCount()

  // Second load (should use cache)
  machine.dispatch(actions.changeTopik())
  machine.dispatch(actions.selectTopik("test"))
  await waitFor(() => machine.getState().phase === "active")

  const loadCount2 = repository.getLoadCount()

  // Should not have loaded again
  expect(loadCount2).toBe(loadCount1)
})
```

### React Tests

```typescript
test("V6: Survives remount", () => {
  const repository = createMockRepository()

  const { result, unmount, rerender } = renderHook(() =>
    useSessionMachine({ repository })
  )

  // Dispatch event
  act(() => {
    result.current.dispatch(actions.selectTopik("test"))
  })

  const stateBefore = result.current.state

  // Unmount and remount
  unmount()
  rerender()

  const stateAfter = result.current.state

  // State should be preserved
  expect(stateAfter).toEqual(stateBefore)
})
```

## Performance Considerations

### Memory Profile

```typescript
// State size stays constant regardless of batch size
const state = {
  phase: "active",               // 4 bytes
  dataRef: {
    topikKey: "topik-01",        // ~20 bytes
    status: "ready",             // 4 bytes
    batchCount: 10,              // 4 bytes
    currentBatchMeta: {          // ~50 bytes
      id: 1,
      messageCount: 100,
      questionCount: 20
    }
  },
  active: { ... },               // ~100 bytes
  // Total: ~200 bytes, independent of batch size
}
```

### Render Optimization

React only re-renders when state changes:

```typescript
// Machine uses referential equality
if (newState !== oldState) {
  notify(newState)
}

// React uses shallow comparison
const [state, setState] = useState(...)

// Only triggers render if state object identity changed
machine.subscribe(setState)
```

## Migration from Old System

### Before

```typescript
// Tightly coupled to React
const [batches, setBatches] = useState([])

useEffect(() => {
  fetch(`/topiks/${key}.json`)
    .then((r) => r.json())
    .then(setBatches)
}, [key])

// Large state in React
// No caching
// Remount triggers refetch
```

### After

```typescript
// Pure core + React adapter
const { state, dispatch } = useSessionMachine({ repository })

// O(1) state in React
// Repository handles caching
// Remounts are stable
```

## Future Extensions

The architecture supports future features without breaking changes:

### Multiplayer Sessions

```typescript
// Add multiplayer effect
type SessionEffect =
  | ... existing effects
  | { type: "SYNC_CURSOR", cursor: SessionCursor }

// Execute in runtime
case "SYNC_CURSOR":
  websocket.send({ type: "cursor", data: effect.cursor })
```

### Persistence

```typescript
// Serialize state
const serialized = JSON.stringify(machine.getState())
localStorage.setItem("session", serialized)

// Restore
const restored = JSON.parse(localStorage.getItem("session"))
const machine = createSessionMachine(repository, restored)
```

### Analytics

```typescript
// Subscribe to all state changes
machine.subscribe((state) => {
  analytics.track("state_change", {
    phase: state.phase,
    mode: state.active?.mode,
  })
})
```

## Summary

This architecture provides:

1. **Framework independence** - Core logic runs anywhere
2. **Memory efficiency** - O(1) state size
3. **Lifecycle stability** - Survives remounts
4. **Race safety** - Handles concurrent operations
5. **Testability** - Pure functions, deterministic
6. **Extensibility** - Add features without refactoring

The key insight: **React renders state, it doesn't own business logic.**
