# www

## 0.0.1

### Patch Changes

- www's build graph changed - the app itself or one of its workspace
  dependencies was touched since the last Docker publish. Most
  dependency bumps don't change www's actual behaviour, so this
  needs a human read of the diff: merge (squash) this PR to build
  and push an updated `paulgsc/www` image to Docker Hub, or close it
  if the change doesn't warrant a new image.
