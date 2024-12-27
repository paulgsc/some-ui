# UI State Machine Framework

A general-purpose UI state machine framework, inspired by and forked from the [Unsplash uploader prototype](https://github.com/unsplash/uploader-prototype). While the original project focused specifically on file uploading functionality, this fork aims to create a more versatile and reusable state machine pattern for various UI interactions.

## Project Goals

- Create a pluggable, general-purpose state machine framework for UI interactions
- Modernize the state management approach by replacing Redux with Zustand
- Maintain the core concepts of finite-state machines while increasing flexibility
- Provide a foundation that can be easily adapted for different UI patterns beyond file uploading

## Key Differences from Original

This fork significantly diverges from the original Unsplash prototype in several ways:
- Replaces Redux with Zustand for simpler, more flexible state management
- Generalizes the state machine patterns to work with various UI interactions
- Removes upload-specific implementations in favor of pluggable interfaces
- Additional architectural changes and improvements as development progresses

## Development

```sh
yarn
npm run compile:watch
npm run start:server
open http://localhost:8080
# OR
open http://localhost:8080/?should_render_demos
```

## Attribution

This project is based on the [original Unsplash uploader prototype](https://github.com/unsplash/uploader-prototype) created by:
- Oliver Joseph Ash (@OliverJAsh)
- Unsplash engineering team

While this fork takes a different direction, the original project provided valuable insights into state machine patterns in UI development. For an overview of the original architecture, check out their [detailed blog post](https://medium.com/unsplash/building-the-unsplash-uploader-880a5ba0d442).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Original Repository

The original Unsplash uploader prototype can be found at: https://github.com/unsplash/uploader-prototype
