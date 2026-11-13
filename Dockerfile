# Cube Crashers dedicated server
#   docker run -p 47800:47800 ghcr.io/dominikamann/cube-crashers-server --mode gungame --name "My Server"
FROM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# no install scripts: the server needs no Electron download
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:server

FROM node:25-alpine
WORKDIR /srv
COPY --from=build /app/dist-server/cube-crashers-server.mjs .
ENV NODE_ENV=production
EXPOSE 47800
USER node
ENTRYPOINT ["node", "cube-crashers-server.mjs"]
