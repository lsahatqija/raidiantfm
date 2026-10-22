FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
RUN chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3050

EXPOSE 3050

CMD ["npm", "start"]
