import init, {
  extent as rustExtent,
  extent_by_accessor as rustExtentByAccessor,
  ScaleLinear as RustScaleLinear,
  ScaleTime as RustScaleTime,
} from "d3-scale-rust"

// Keep track of initialization status
let isInitialized = false
let initPromise: Promise<void> | null = null

// Initialize the WASM module
export function initScales(): Promise<void> {
  if (isInitialized) return Promise.resolve()
  if (initPromise) return initPromise

  initPromise = init().then(() => {
    isInitialized = true
  })

  return initPromise
}

// Helper to ensure initialization
function ensureInitialized() {
  if (!isInitialized) {
    throw new Error("D3 scales not initialized. Call initScales() first.")
  }
}

// D3-like linear scale
export function scaleLinear() {
  ensureInitialized()

  const rustScale = new RustScaleLinear()

  const scale = function (value: number): number {
    return rustScale.scale(value)
  }

  // Add methods to match d3's API
  scale.domain = function (domain?: [number, number]) {
    if (!domain) {
      // If no argument, return current domain (not implemented in Rust binding yet)
      return [0, 1] // Placeholder
    }
    rustScale.domain(domain)
    return scale
  }

  scale.range = function (range?: [number, number]) {
    if (!range) {
      // If no argument, return current range (not implemented in Rust binding yet)
      return [0, 1] // Placeholder
    }
    rustScale.range(range)
    return scale
  }

  scale.nice = function (count?: number) {
    rustScale.nice(count)
    return scale
  }

  scale.clamp = function (clamp?: boolean) {
    if (clamp === undefined) {
      // Return current clamp setting (not implemented in Rust binding yet)
      return false // Placeholder
    }
    rustScale.clamp(clamp)
    return scale
  }

  scale.ticks = function (count?: number) {
    return rustScale.ticks(count)
  }

  return scale
}

// D3-like time scale
export function scaleTime() {
  ensureInitialized()

  const rustScale = new RustScaleTime()

  const scale = function (date: Date): number {
    return rustScale.scale(date)
  }

  // Add methods to match d3's API
  scale.domain = function (domain?: [Date, Date]) {
    if (!domain) {
      // If no argument, return current domain (not implemented in Rust binding yet)
      return [new Date(), new Date()] // Placeholder
    }
    rustScale.domain(domain)
    return scale
  }

  scale.range = function (range?: [number, number]) {
    if (!range) {
      // If no argument, return current range (not implemented in Rust binding yet)
      return [0, 1] // Placeholder
    }
    rustScale.range(range)
    return scale
  }

  scale.nice = function (count?: number) {
    rustScale.nice(count)
    return scale
  }

  scale.clamp = function (clamp?: boolean) {
    if (clamp === undefined) {
      // Return current clamp setting (not implemented in Rust binding yet)
      return false // Placeholder
    }
    rustScale.clamp(clamp)
    return scale
  }

  scale.ticks = function (count?: number) {
    return rustScale.ticks(count)
  }

  return scale
}

// D3-like extent function
export function extent(array: any[], accessor?: (d: any) => any): [any, any] {
  ensureInitialized()

  if (!accessor) {
    return rustExtent(array) as [any, any]
  }

  // Create a JavaScript function to pass to Rust
  const accessorFn = function (item: any) {
    return accessor(item)
  }

  return rustExtentByAccessor(array, accessorFn) as [any, any]
}
