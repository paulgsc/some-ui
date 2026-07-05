# effects/

The external browser-API domain: `browser.*`/`chrome.*` messaging and
storage adapters, and the DOM-touching helpers the presentation layer is not
allowed to call directly (`document.createElement`, `addEventListener`,
`requestAnimationFrame`, injected-script scraping, etc).

Modules here may freely import `document`/`browser`/`chrome`. Code under
`logic/` must go through an `effects/` adapter instead of reaching for those
globals itself.
