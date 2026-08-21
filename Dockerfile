FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    WHISPER_PYTHON_PATH=/opt/venv/bin/python \
    WHISPER_CACHE_DIR=/app/.whisper-cache \
    YT_DLP_PATH=/opt/venv/bin/yt-dlp

WORKDIR /app

# ffmpeg is required to extract audio before Whisper transcription.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ffmpeg libgomp1 ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip

COPY requirements.txt ./requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["sh", "-c", "pnpm start --hostname 0.0.0.0 --port ${PORT:-3000}"]
