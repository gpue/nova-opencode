# nova-opencode — OpenCode web UI + MCP bridge for the Nova platform
# ------------------------------------------------------------------
# Provides:
#   - OpenCode web UI (port 4096, internal) for browser-based AI coding
#   - MCP bridge server (port 8081, internal) for programmatic agent access
#   - Caddy reverse proxy (port 8080, exposed) routing BASE_PATH prefix
#   - git, Python 3, Nova CLI pre-installed in the workspace
# ------------------------------------------------------------------

FROM debian:bookworm-slim

# ── Versions ────────────────────────────────────────────────────────
ARG OPENCODE_VERSION=1.2.25
ARG NOVA_CLI_VERSION=0.0.224
ARG CADDY_VERSION=2.9.1

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ── System packages + Python 3 + git ───────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg git python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# ── Install OpenCode binary from GitHub Releases ───────────────────
RUN curl -fsSL "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz" \
    | tar -xz -C /usr/local/bin \
    && chmod +x /usr/local/bin/opencode

# ── Install Caddy (reverse proxy) ──────────────────────────────────
RUN curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin caddy \
    && chmod +x /usr/local/bin/caddy

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
    && mkdir -p /app/static \
    && mkdir -p /config/caddy /data/caddy \
    && chown -R opencode:opencode /workspace /home/opencode /app /config/caddy /data/caddy

# ── Copy application files ──────────────────────────────────────────
COPY --chown=opencode:opencode opencode.json /home/opencode/.config/opencode/opencode.json
COPY --chown=opencode:opencode mcp_bridge.py /app/mcp_bridge.py
COPY --chown=opencode:opencode start-opencode.sh /app/start-opencode.sh
COPY --chown=opencode:opencode Caddyfile /app/Caddyfile
COPY --chown=opencode:opencode app_icon.svg /app/static/app_icon.svg
COPY --chown=opencode:opencode workspace/ /workspace/

RUN chmod +x /app/start-opencode.sh

# Caddy needs these for its data/config dirs
ENV XDG_CONFIG_HOME=/config
ENV XDG_DATA_HOME=/data

USER opencode
WORKDIR /workspace

# Caddy reverse proxy (exposed), OpenCode + MCP bridge (internal)
EXPOSE 8080

ENTRYPOINT ["/app/start-opencode.sh"]
