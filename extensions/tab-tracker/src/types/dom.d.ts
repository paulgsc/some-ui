export {}

declare global {
  interface Document {
    webkitFullscreenElement?: Element | null
  }
}
