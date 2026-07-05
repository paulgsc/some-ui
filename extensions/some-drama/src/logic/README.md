# logic/

Owned-domain code only: pure data, derivations, and (eventually) FSM
reducers/typestate. Nothing here may reference `document.*`, `window.*`,
`browser.*`, or `chrome.*` — that seam is enforced by
`extension-charter/no-logic-layer-side-effects` in `eslint.config.js`.

If a change to a file under `logic/` needs a DOM or browser-API call, the
call belongs in `effects/`; inject it as a parameter or callback instead of
reaching for the global.
