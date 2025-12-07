// websocket/index.ts
/**
 * WebSocket module - Singleton pattern with atomic lifecycle coordination
 *
 * Architecture:
 * - LifecycleStateMachine: FSM for connection states
 * - ReferenceCounter: Ref-counted lifecycle management
 * - MutationQueue: Serialized command execution
 * - ListenerRegistry: Type-safe event listeners
 * - WebSocketManager: Core singleton coordinator
 * - useWebSocket: React hook interface
 *
 * Guarantees:
 * ✅ Single connection per URL across all components
 * ✅ Atomic initialization (runs once, all waiters share result)
 * ✅ Serialized mutations (no race conditions)
 * ✅ Deterministic cleanup (ref-counted disposal)
 * ✅ No thundering herd
 */

export { LifecycleStateMachine } from "./lifecycle"
export type { LifecycleState } from "./lifecycle"

export { ReferenceCounter } from "./ref-counter"
export { MutationQueue } from "./mutation-queue"
export { ListenerRegistry } from "./listener-registry"

export { WebSocketManager } from "./manager"
export type { WebSocketManagerOptions, InitFunction } from "./manager"

export { useWebSocket } from "./use-websocket"
export type { UseWebSocketOptions, UseWebSocketReturn } from "./use-websocket"
