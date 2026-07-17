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
        // Reporting is best-effort; a failed dynamic import (e.g. offline)
        // shouldn't surface as an unhandled rejection.
      })
  }
}

export default reportWebVitals
