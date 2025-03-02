import init, {
  tick_increment as wasmTickIncrement,
  ticks as wasmTicks,
  tick_step as wasmTickStep,
} from "some-charts"

// Ensure WASM is initialized before using the functions

let wasmReady: Promise<void> | null = null

export async function ensureWasmReady(): Promise<typeof wasmReady> {
  if (!wasmReady) {
    // Don't specify a path - our mock will handle it
    wasmReady = init().then(() => {})
  }
  return wasmReady
}

// Wrapper functions for TypeScript
export async function getTicks(
  start: number,
  stop: number,
  count: number
): Promise<Array<number>> {
  await ensureWasmReady()
  return Array.from(wasmTicks(start, stop, count))
}

export async function tickIncrement(
  start: number,
  stop: number,
  count: number
): Promise<number> {
  await ensureWasmReady()
  return wasmTickIncrement(start, stop, count)
}

export async function tickStep(
  start: number,
  stop: number,
  count: number
): Promise<number> {
  await ensureWasmReady()
  return wasmTickStep(start, stop, count)
}
