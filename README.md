## Using Docker Compose

### Entering the Container Shell

To access the container’s environment, use:

```bash
docker compose exec dev bash
```

This command lets you step inside the running container, giving you a prompt like:

```bash
root@container_id:/app#
```

You can now run commands inside the container, for example:

```bash
node --version
pnpm --version
pnpm install
pnpm dev
```

To exit the container, simply run:

```bash
exit
```

### Running Commands Directly

You can also run commands without entering the shell:

```bash
docker compose exec dev pnpm dev
docker compose exec dev node --version
```

### Running Common Development Tasks

Once inside the container, you can run your usual development tasks:

```bash
pnpm storybook
pnpm dev
pnpm lint
pnpm test
```

### Accessing the App

When you run your app or Storybook inside the container, you can access it via your browser at `localhost:5173` for Vite or `localhost:6006` for Storybook, thanks to port forwarding.


