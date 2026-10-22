# syntax=docker/dockerfile:1
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY raidiohost-node/package.json raidiohost-node/package.json
COPY raidiohost-webplayer/package.json raidiohost-webplayer/package.json

RUN npm ci --workspace=raidiohost-webplayer --include-workspace-root=false

COPY raidiohost-webplayer raidiohost-webplayer

ARG VITE_SERVER_BASE_URL=""
ENV VITE_SERVER_BASE_URL=${VITE_SERVER_BASE_URL}

RUN npm run build --workspace=raidiohost-webplayer

FROM nginx:1.29-alpine AS runtime

COPY raidiohost-webplayer/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/raidiohost-webplayer/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
