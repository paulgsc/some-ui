import { LifecycleStateMachine } from "@ws/lib/lifecycle"
import { ListenerRegistry } from "@ws/lib/listener-registry"
import { MutationQueue } from "@ws/lib/mutation-queue"
import { ReferenceCounter } from "@ws/lib/ref-counter"

export type WebSocketManagerOptions = {
  autoReconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  maxReconnectInterval?: number
  debugMode?: boolean
}

export type InitFunction = (manager: WebSocketManager) => void | Promise<void>

export type WebSocketSnapshot<I = unknown> = {
  isConnected: boolean
  isInitializing: boolean
  error: string | null
  lastMessage: I | null
  parseErrorCount: number
  reconnectAttempts: number
}

/**
 * Singleton WebSocket manager with lifecycle coordination
 */
export class WebSocketManager {
  private static instances = new Map<string, WebSocketManager>()

  private socket: WebSocket | null = null
  private readonly lifecycle = new LifecycleStateMachine()
  private readonly refCounter: ReferenceCounter
  private readonly mutationQueue = new MutationQueue()

  private readonly messageListeners = new ListenerRegistry<unknown>()
  private readonly connectionListeners = new ListenerRegistry<boolean>()
  private readonly errorListeners = new ListenerRegistry<Event | Error>()

  // External store for React
  private storeListeners = new Set<() => void>()
  private snapshot: WebSocketSnapshot = {
    isConnected: false,
    isInitializing: false,
    error: null,
    lastMessage: null,
    parseErrorCount: 0,
    reconnectAttempts: 0,
  }
  private emitScheduled = false

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private manualDisconnect = false

  private initPromise: Promise<void> | null = null
  private initFunction: InitFunction | null = null

  private lastInitError: Error | null = null
  private initErrorTime: number = 0

  private constructor(
    private readonly url: string,
    private readonly options: WebSocketManagerOptions = {}
  ) {
    this.refCounter = new ReferenceCounter({
      onZero: (): void => this.dispose(),
    })
  }

  static getInstance(
    url: string,
    options?: WebSocketManagerOptions
  ): WebSocketManager {
    if (!this.instances.has(url)) {
      this.instances.set(url, new WebSocketManager(url, options))
    }
    return this.instances.get(url)!
  }

  private log(...args: Array<unknown>): void {
    if (this.options.debugMode) {
      // eslint-disable-next-line no-console
      console.log(`[WebSocket ${this.url}]`, ...args)
    }
  }

  // External store API for React
  subscribe = (listener: () => void): (() => void) => {
    this.storeListeners.add(listener)
    return () => this.storeListeners.delete(listener)
  }

  getSnapshot = <I = unknown>(): WebSocketSnapshot<I> => {
    // `this.snapshot` is stored untyped (lastMessage: unknown) since the
    // manager itself never validates incoming messages - the caller's zod
    // schema (in useWebSocket) is the actual trust boundary for `I`.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return this.snapshot as WebSocketSnapshot<I>
  }

  private emitStoreChange(): void {
    if (this.emitScheduled) return
    this.emitScheduled = true

    queueMicrotask(() => {
      this.emitScheduled = false
      for (const listener of this.storeListeners) {
        listener()
      }
    })
  }

  private updateSnapshot(patch: Partial<WebSocketSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.emitStoreChange()
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private getBackoffDelay(): number {
    const base = this.options.reconnectInterval ?? 1000
    const max = this.options.maxReconnectInterval ?? 30000

    const exp = Math.min(base * 2 ** this.reconnectAttempts, max)

    // ±20% jitter to prevent thundering herd
    const jitter = exp * (Math.random() * 0.4 - 0.2)
    return Math.max(0, exp + jitter)
  }

  /**
   * Acquire a reference to this manager
   * ✅ Guarantees ONE initialization for N callers (thundering herd protection)
   */
  async acquire(init?: InitFunction): Promise<void> {
    const count = this.refCounter.acquire()

    // Store init function on first acquire
    if (count === 1 && init) {
      this.initFunction = init
    }

    // Already initialized - just return
    if (this.lifecycle.is("initialized")) {
      return
    }

    // ✅ If there was a recent init failure, throw it immediately
    // This prevents cascading retries from multiple callers
    if (this.lastInitError && Date.now() - this.initErrorTime < 5000) {
      this.log("Rejecting acquire() - recent init failure")
      throw this.lastInitError
    }

    // ✅ Currently initializing - ALL callers wait on the SAME promise
    if (this.lifecycle.is("initializing")) {
      this.log("Waiting for existing initialization...")
      if (!this.initPromise) {
        throw new Error("Initialization in progress but no promise found")
      }
      // This is the key: everyone waits on the same promise
      await this.initPromise
      return
    }

    // ✅ Start initialization - create ONE promise for all waiters
    this.lifecycle.transitionTo("initializing")
    this.updateSnapshot({ isInitializing: true })

    this.initPromise = (async () => {
      try {
        this.log("Starting initialization...")

        // Connect socket
        await this.connectSocket()

        // Run init callback if provided
        if (this.initFunction) {
          this.log("Running init callback...")
          await this.initFunction(this)
        }

        this.lifecycle.transitionTo("initialized")
        this.updateSnapshot({
          isInitializing: false,
          isConnected: true,
          error: null,
        })

        // ✅ Clear error state on success
        this.lastInitError = null
        this.initErrorTime = 0

        this.log("Initialization complete")
      } catch (err) {
        this.log("Initialization failed:", err)

        // ✅ Store error to prevent cascading retries
        this.lastInitError = err instanceof Error ? err : new Error(String(err))
        this.initErrorTime = Date.now()

        this.lifecycle.transitionTo("idle")
        this.updateSnapshot({
          isInitializing: false,
          error: err instanceof Error ? err.message : String(err),
        })

        // ✅ Clear promise so next acquire can try again (after debounce period)
        this.initPromise = null

        throw err
      }
    })()

    // ✅ All callers wait on this same promise
    await this.initPromise
  }

  /**
   * Release a reference to this manager
   * Automatically disposes when ref count reaches zero
   */
  release(): void {
    const count = this.refCounter.release()
    this.log(`Released reference (count: ${count})`)
  }

  /**
   * Connect the underlying WebSocket
   */
  private async connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.manualDisconnect = false
      this.clearReconnectTimer()

      try {
        this.socket = new WebSocket(this.url)

        this.socket.onopen = (): void => {
          this.log("Connected")
          this.reconnectAttempts = 0
          this.updateSnapshot({ reconnectAttempts: 0 })

          this.connectionListeners.notify(true)
          this.updateSnapshot({ isConnected: true, error: null })
          resolve()
        }

        this.socket.onmessage = (event): void => {
          try {
            const data: unknown = JSON.parse(String(event.data))
            this.messageListeners.notify(data)
            this.updateSnapshot({ lastMessage: data })
          } catch (err) {
            this.log("Failed to parse message:", err)
            this.errorListeners.notify(
              err instanceof Error ? err : new Error(String(err))
            )
            this.updateSnapshot({
              parseErrorCount: this.snapshot.parseErrorCount + 1,
            })
          }
        }

        this.socket.onclose = (): void => {
          this.log("Disconnected")
          this.connectionListeners.notify(false)
          this.updateSnapshot({ isConnected: false })

          if (
            this.options.autoReconnect &&
            !this.manualDisconnect &&
            this.lifecycle.is("initialized")
          ) {
            const max = this.options.maxReconnectAttempts ?? 3

            if (this.reconnectAttempts >= max) {
              this.log("Reconnect limit reached, giving up")
              this.updateSnapshot({
                error: "Reconnect limit reached",
              })
              return
            }

            const delay = this.getBackoffDelay()
            this.reconnectAttempts++
            this.updateSnapshot({ reconnectAttempts: this.reconnectAttempts })

            this.log(
              `Reconnect attempt ${this.reconnectAttempts}/${max} in ${delay.toFixed(0)}ms`
            )

            this.reconnectTimer = setTimeout(() => {
              void this.reconnect()
            }, delay)
          }
        }

        this.socket.onerror = (error): void => {
          this.log("Connection error:", error)
          this.errorListeners.notify(error)
          this.updateSnapshot({ error: "WebSocket connection error" })
          reject(error)
        }
      } catch (err) {
        this.log("Connection setup error:", err)
        this.errorListeners.notify(
          err instanceof Error ? err : new Error(String(err))
        )
        reject(err)
      }
    })
  }

  /**
   * Reconnect after disconnect
   */
  private async reconnect(): Promise<void> {
    if (!this.lifecycle.is("initialized") || this.isConnected) return

    try {
      await this.connectSocket()

      // Re-run init callback after reconnect
      if (this.initFunction) {
        await this.initFunction(this)
      }
    } catch (err) {
      this.log("Reconnect failed:", err)
      // Failure already counted in reconnectAttempts
    }
  }

  /**
   * Disconnect the socket
   */
  private disconnect(): void {
    this.manualDisconnect = true
    this.clearReconnectTimer()

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  /**
   * Dispose of this manager (called when ref count reaches zero)
   */
  private dispose(): void {
    if (this.lifecycle.is("disposing")) return

    this.log("Disposing manager...")

    // Allow dispose from any state (handle cancellation)
    this.lifecycle.transitionTo("disposing")

    this.disconnect()
    this.messageListeners.clear()
    this.connectionListeners.clear()
    this.errorListeners.clear()
    this.mutationQueue.clear()
    this.storeListeners.clear()
    this.initFunction = null
    this.initPromise = null
    this.lastInitError = null
    this.initErrorTime = 0
    this.reconnectAttempts = 0

    this.lifecycle.reset()
    this.refCounter.reset()
    this.updateSnapshot({
      isConnected: false,
      isInitializing: false,
      error: null,
      lastMessage: null,
      parseErrorCount: 0,
      reconnectAttempts: 0,
    })

    WebSocketManager.instances.delete(this.url)
    this.log("Manager disposed")
  }

  /**
   * Send a message immediately (not serialized)
   */
  sendMessage(message: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected")
    }
    this.socket.send(JSON.stringify(message))
  }

  /**
   * Send a message with serialization guarantee
   */
  sendSerialized(message: unknown): Promise<void> {
    return this.mutationQueue.enqueue(() => this.sendMessage(message))
  }

  /**
   * Enqueue a custom mutation
   */
  enqueueMutation<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutationQueue.enqueue(fn)
  }

  // Listener management
  addMessageListener(callback: (data: unknown) => void): () => void {
    this.messageListeners.add(callback)
    return () => this.messageListeners.remove(callback)
  }

  addConnectionListener(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback)
    return () => this.connectionListeners.remove(callback)
  }

  addErrorListener(callback: (error: Event | Error) => void): () => void {
    this.errorListeners.add(callback)
    return () => this.errorListeners.remove(callback)
  }

  // State accessors
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  get isInitializing(): boolean {
    return this.lifecycle.is("initializing")
  }

  get isInitialized(): boolean {
    return this.lifecycle.is("initialized")
  }

  get lifecycleState(): string {
    return this.lifecycle.current
  }

  get referenceCount(): number {
    return this.refCounter.current
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
