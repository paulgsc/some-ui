const reportWebVitals = (onPerfEntry?: () => void): void => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import("web-vitals")
      .then(({ onCLS, onINP, onFCP, onLCP, onTTFB }) => {
        onCLS(onPerfEntry)
        onINP(onPerfEntry)
        onFCP(onPerfEntry)
        onLCP(onPerfEntry)
        onTTFB(onPerfEntry)
      })
      .catch(() => {
        // Ignored: a failed dynamic import (offline) means no vitals this
        // load, and nothing depends on them.
      })
  }
}

export default reportWebVitals
