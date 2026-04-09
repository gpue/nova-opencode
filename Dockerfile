# nova-opencode — OpenCode web UI + MCP bridge for the Nova platform
# ------------------------------------------------------------------
# Provides:
#   - OpenCode web UI (port 4096, internal) for browser-based AI coding
#   - MCP bridge server (port 8081, internal) for programmatic agent access
#   - Caddy reverse proxy (port 8080, exposed) routing BASE_PATH prefix
#   - git, Python 3, Nova CLI, ssh, ping, nc, dig, traceroute pre-installed
# ------------------------------------------------------------------

# ── Stage 1: Build custom Caddy with replace-response module ───────
# The replace-response module lets us inject <base href> into OpenCode's
# HTML so assets resolve correctly when served behind a sub-path prefix.
ARG CADDY_VERSION=2.9.1
FROM caddy:${CADDY_VERSION}-builder AS caddy-builder
ARG CADDY_VERSION=2.9.1
RUN xcaddy build v${CADDY_VERSION} \
        --with github.com/caddyserver/replace-response \
        --output /usr/local/bin/caddy

# ── Stage 2: Build custom frontend ─────────────────────────────────
FROM node:22-bookworm-slim AS ui-builder

WORKDIR /ui
COPY ui/package.json ui/package-lock.json ui/tsconfig.json ui/tsconfig.app.json ui/vite.config.ts ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# ── Stage 3: Final image ───────────────────────────────────────────
FROM debian:bookworm-slim

# ── Versions ────────────────────────────────────────────────────────
ARG OPENCODE_VERSION=1.2.27
ARG NOVA_CLI_VERSION=0.0.224

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ── System packages + Python 3 + git + network tools ───────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gh gnupg git python3 python3-pip python3-venv xdg-utils \
        openssh-client netcat-openbsd iputils-ping dnsutils traceroute \
    && rm -rf /var/lib/apt/lists/*

# ── Install OpenCode binary from GitHub Releases ───────────────────
RUN curl -fsSL "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz" \
    | tar -xz -C /usr/local/bin \
    && chmod +x /usr/local/bin/opencode

# ── Copy custom Caddy binary from builder stage ───────────────────
COPY --from=caddy-builder /usr/local/bin/caddy /usr/local/bin/caddy

# ── Install Nova CLI (Go binary from GitHub Releases) ──────────────
RUN curl -fsSL "https://github.com/wandelbotsgmbh/nova-cli/releases/download/${NOVA_CLI_VERSION}/novacli_linux_amd64-${NOVA_CLI_VERSION}.tar.gz" \
    | tar -xz -C /usr/local/bin \
    && chmod +x /usr/local/bin/nova

# ── Install Python deps for MCP bridge ──────────────────────────────
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    -r /tmp/requirements.txt && rm /tmp/requirements.txt

# ── Create non-root user ────────────────────────────────────────────
RUN groupadd -r opencode && useradd -r -g opencode -m -d /home/opencode opencode

# ── Directory structure ─────────────────────────────────────────────
RUN mkdir -p /workspace \
    && mkdir -p /home/opencode/.config/opencode \
    && mkdir -p /home/opencode/.local/share/opencode \
    && mkdir -p /app/static \
    && mkdir -p /app/ui \
    && mkdir -p /caddy/config /caddy/data \
    && chown -R opencode:opencode /workspace /home/opencode /app /caddy

# ── Install Node.js and nats for service registry ───────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g nats@2

# ── Copy application files ──────────────────────────────────────────
COPY --chown=opencode:opencode opencode.json /home/opencode/.config/opencode/opencode.json
COPY --chown=opencode:opencode mcp_bridge.py /app/mcp_bridge.py
COPY --chown=opencode:opencode service-registry.mjs /app/service-registry.mjs
COPY --chown=opencode:opencode start-opencode.sh /app/start-opencode.sh
COPY --chown=opencode:opencode Caddyfile /app/Caddyfile
COPY --chown=opencode:opencode app_icon.svg /app/static/app_icon.svg
COPY --chown=opencode:opencode static/ /app/static/
COPY --chown=opencode:opencode workspace/ /workspace/
COPY --from=ui-builder --chown=opencode:opencode /ui/dist/ /app/ui/

RUN chmod +x /app/start-opencode.sh

# Do NOT set XDG_CONFIG_HOME / XDG_DATA_HOME globally — OpenCode and Caddy
# both use XDG conventions but need separate data dirs.  The start script
# sets per-process env vars instead.

USER opencode
WORKDIR /workspace

# Caddy reverse proxy (exposed), OpenCode + MCP bridge (internal)
EXPOSE 8080

ENTRYPOINT ["/app/start-opencode.sh"]
