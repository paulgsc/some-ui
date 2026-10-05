/**
 * WebSocket module: one connection per URL across all components, initialized
 * once (all waiters share the result), with serialized mutations and
 * ref-counted disposal. WebSocketManager coordinates LifecycleStateMachine,
 * ReferenceCounter, MutationQueue and ListenerRegistry; useWebSocket is the
 * React interface.
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
