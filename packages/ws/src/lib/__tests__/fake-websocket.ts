/** Minimal fake WebSocket for driving WebSocketManager/useWebSocket tests without a real socket. */
export class FakeWebSocket {
  static instances: Array<FakeWebSocket> = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  sent: Array<string> = []

  constructor(url: string | URL) {
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateMalformedMessage(raw: string): void {
    this.onmessage?.({ data: raw })
  }

  simulateError(error: unknown = new Error("socket error")): void {
    this.onerror?.(error)
  }

  /** A real close event - distinct from a manual disconnect. */
  simulateClose(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }
}

let urlCounter = 0
export function nextUrl(): string {
  urlCounter += 1
  return `ws://test.local/${urlCounter}`
}
