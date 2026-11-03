FROM node:26-alpine AS builder

WORKDIR /app

RUN npm install -g corepack@0.36.0 && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:26-alpine

WORKDIR /app

RUN npm install -g corepack@0.36.0 && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
