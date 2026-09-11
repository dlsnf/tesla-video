FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
  && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

EXPOSE 8742

HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8742/api/health || exit 1

CMD ["node", "server/server.js"]
