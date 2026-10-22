# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY raidiohost-node/package.json raidiohost-node/package.json
COPY raidiohost-webplayer/package.json raidiohost-webplayer/package.json

RUN npm ci --omit=dev --workspace=raidiohost-node --include-workspace-root=false

COPY --chown=node:node raidiohost-node/src raidiohost-node/src

WORKDIR /app/raidiohost-node
USER node

ENV NODE_ENV=production
ENV PORT=3050

EXPOSE 3050

CMD ["npm", "start"]
