FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
CMD ["sh", "-c", "NODE_ENV=production exec node server.js"]
