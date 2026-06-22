// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/firefox.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

// Firefox `browser.*` namespace adapter.
// Aliased in vite.config.firefox.ts as @suspender/platform.
// Full port (compat shims) implemented in story #255.

export const ext: typeof browser = globalThis.browser
