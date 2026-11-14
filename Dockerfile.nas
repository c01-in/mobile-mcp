FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/lib ./lib
COPY package.json LICENSE ./
ENV MOBILEMCP_OWNER_ANDROID=1 MOBILEMCP_DISABLE_TELEMETRY=1 ADB_SERVER_SOCKET=tcp:mobile-mcp-adb:5037 ANDROID_HOME=/opt/android
USER 1000:1001
ENTRYPOINT ["node", "lib/index.js", "--listen", "0.0.0.0:18793"]
