FROM node:latest

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install git for husky
RUN apt-get update && apt-get install -y git

# Install the latest version of npm
RUN npm install -g npm@latest

# Copy package files
COPY .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/*/package.json ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile --prefer-offline

# Copy the rest of the code
COPY . .

# Expose the port Storybook runs on
EXPOSE 6006

# Run Storybook
CMD ["pnpm", "run", "storybook"]
