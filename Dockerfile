# One image for both the API and the judge worker.
#   API:    node src/index.js   (serves the built React app too)
#   Worker: node src/worker.js  (needs /var/run/docker.sock to start sandbox containers)

# ---- build the React client ----
FROM node:20-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ ./
COPY judge/ /app/judge/
COPY samples/ /app/samples/
COPY --from=client /app/client/dist /app/client/dist
# Docker CLI only (talks to the host daemon through the mounted socket).
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
EXPOSE 5000
CMD ["node", "src/index.js"]
