FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY docs ./docs
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM docker:29-cli AS docker-cli

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ansible git openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV HIVEFORGE_BIND_HOST=0.0.0.0
ENV HIVEFORGE_PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
COPY assets ./assets
COPY docs ./docs

RUN mkdir -p /hf

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.HIVEFORGE_PORT || '3000') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "serve"]
