# maishatu-eslint-kit

## 1.2.0

### Minor Changes

- [#160](https://github.com/paulgsc/some-ui/pull/160) [`7eba3d1`](https://github.com/paulgsc/some-ui/commit/7eba3d1485cf02167659b03fdb26dbefbad04c32) Thanks [@paulgsc](https://github.com/paulgsc)! - What add dist files
  How add build ci step
  Why no longer building on postinstall, need build step in ci pipeline

## 1.1.0

### Minor Changes

- [#155](https://github.com/paulgsc/some-ui/pull/155) [`5d1bde9`](https://github.com/paulgsc/some-ui/commit/5d1bde9ff108ba2fd31085974b2d5ae6feef1e4b) Thanks [@paulgsc](https://github.com/paulgsc)! - What remove post install script
  How del script from package.json
  Why was needed for workspace version

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
     `pnpm add -D maishatu-eslint-kit`
  2. Update your ESLint config:

  ```js
  // Flat Config
  // eslint.config.*.{js,mjs}
  import someUIEslint from "maishatu-eslint-kit"

  export default someUIEslint
  ```
