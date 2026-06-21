// document_end

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.removeAttribute("data-sw-prepaint")
  })
})
