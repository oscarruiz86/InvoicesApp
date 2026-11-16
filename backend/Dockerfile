FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 SCARF_ANALYTICS=false
COPY backend/package.json backend/package-lock.json backend/.npmrc ./
RUN npm install --global npm@11.12.1 && npm ci --no-audit --no-fund

FROM dependencies AS development
COPY backend/ ./
COPY shared/ /shared/
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM dependencies AS build
COPY backend/ ./
COPY shared/ /shared/
RUN npm run build

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM production AS worker
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts/typescript-loader.mjs ./scripts/typescript-loader.mjs
COPY --from=build --chown=node:node /app/scripts/notification-worker-production-entrypoint.mjs ./scripts/notification-worker-production-entrypoint.mjs
COPY --from=build --chown=node:node /app/node_modules/typescript ./node_modules/typescript
COPY --from=build --chown=node:node /shared /shared
CMD ["node", "--experimental-loader", "./scripts/typescript-loader.mjs", "./scripts/notification-worker-production-entrypoint.mjs"]