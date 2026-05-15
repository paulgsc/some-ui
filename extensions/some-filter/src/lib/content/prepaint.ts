export const PREPAINT_ATTR = "data-sw-prepaint"

export function enablePrepaint(): void {
  document.documentElement.setAttribute(PREPAINT_ATTR, "")
}

export function disablePrepaint(): void {
  document.documentElement.removeAttribute(PREPAINT_ATTR)
}

/*
  Transfer ownership from provisional shell
    to final rendering state.
    */
export function commitVisualState(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      disablePrepaint()
    })
  })
}
