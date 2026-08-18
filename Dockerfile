FROM oven/bun:1.3.14-debian

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates ffmpeg rclone \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --chown=bun:bun . .
RUN mkdir --parents /var/lib/assets-service \
  && chown --recursive bun:bun /var/lib/assets-service

ENV NODE_ENV=production
ENV ASSETS_DATABASE_PATH=/var/lib/assets-service/assets.sqlite

USER bun
EXPOSE 8787
VOLUME ["/var/lib/assets-service"]
CMD ["run", "api"]
