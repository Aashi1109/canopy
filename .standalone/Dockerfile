# syntax=docker/dockerfile:1

ARG NODE_VERSION=26-bookworm-slim

FROM node:${NODE_VERSION} AS builder
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.14.0

WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm-standalone,target=/pnpm/store \
    pnpm install --store-dir /pnpm/store --frozen-lockfile
RUN mkdir -p apps/admin/public apps/devtools/public apps/platform/public /runtime \
    && pnpm --workspace-concurrency=1 -r --if-present run build \
    && for app in admin auth devtools media paperwork platform; do \
      cp -a "apps/${app}/.next/standalone/." /runtime/; \
      mkdir -p "/runtime/apps/${app}/.next"; \
      cp -a "apps/${app}/.next/static" "/runtime/apps/${app}/.next/static"; \
      cp -a "apps/${app}/public" "/runtime/apps/${app}/public"; \
      rm -rf "apps/${app}/.next"; \
    done

FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /tmp/nginx/client /tmp/nginx/proxy \
    && chown -R nextjs:nodejs /tmp/nginx

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /runtime /app

COPY .standalone/nginx.conf /etc/nginx/nginx.conf
COPY .standalone/supervisord.conf /etc/supervisor/canopy.conf

USER nextjs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "const net=require('node:net');Promise.all([3100,3101,3102,3103,3104,3105].map(port=>new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1',()=>{socket.destroy();resolve()});socket.setTimeout(2000,()=>{socket.destroy();reject()});socket.once('error',reject)}))).then(()=>process.exit(0),()=>process.exit(1))"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/canopy.conf"]
