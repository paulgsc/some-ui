# @some-ui/eslint

## 1.0.0

### Major Changes

- [#145](https://github.com/paulgsc/some-ui/pull/145) [`6b4f469`](https://github.com/paulgsc/some-ui/commit/6b4f469efea4eb9fbe49c1f22f2f477218bf3c8f) Thanks [@paulgsc](https://github.com/paulgsc)! - the first release of my custom eslint plugin

  WHAT:

  - Initial release of my custom ESLint plugin providing specialized rules for Some UI components and all my other repos
  - Includes rules for proper component props usage
  - Enforces consistent pattern implementation across the codebase

  WHY:

  - Standardize development practices across all my projects
  - Catch common implementation errors early in development
  - Ensure consistent component usage patterns
  - Eslint junkie, just love having a strict, extensive eslint config just cause!

  HOW:
  To use this plugin in a project:

  1. Install the plugin:
     `pnpm add -D @some-ui/eslint`
  2. Update your ESLint config:

  ```js
  // Flat Config
  // eslint.config.*.{js,mjs}
  import someUIEslint from "@some-ui/eslint"

  export default someUIEslint
  ```
