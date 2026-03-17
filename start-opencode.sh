#!/usr/bin/env bash
# start-opencode.sh — entrypoint for nova-opencode container
# Starts Caddy reverse proxy (port 8080), OpenCode web UI (port 4096),
# and MCP bridge server (port 8081).
set -euo pipefail

export BASE_PATH="${BASE_PATH:-/cell/nova-opencode}"
export OPENCODE_PORT="${OPENCODE_PORT:-4096}"
export MCP_BRIDGE_PORT="${MCP_BRIDGE_PORT:-8081}"
export WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
export OPENCODE_XDG_ROOT="${WORKSPACE_DIR}/.opencode"
export PERSISTENT_HOME="${WORKSPACE_DIR}/.home/opencode"
export XDG_CONFIG_HOME="${OPENCODE_XDG_ROOT}/config"
export XDG_DATA_HOME="${OPENCODE_XDG_ROOT}/data"
export XDG_CACHE_HOME="${OPENCODE_XDG_ROOT}/cache"

mkdir -p "${PERSISTENT_HOME}" "${PERSISTENT_HOME}/.config" "${PERSISTENT_HOME}/.cache" "${PERSISTENT_HOME}/.local/share"

mkdir -p "${OPENCODE_XDG_ROOT}/config/opencode" "${OPENCODE_XDG_ROOT}/data" "${OPENCODE_XDG_ROOT}/cache"

if [ -f /home/opencode/.config/opencode/opencode.json ] && [ ! -f "${OPENCODE_XDG_ROOT}/config/opencode/opencode.json" ]; then
    cp /home/opencode/.config/opencode/opencode.json "${OPENCODE_XDG_ROOT}/config/opencode/opencode.json"
fi

if [ -f /home/opencode/.gitconfig ] && [ ! -f "${PERSISTENT_HOME}/.gitconfig" ]; then
    cp /home/opencode/.gitconfig "${PERSISTENT_HOME}/.gitconfig"
fi

if [ -f /home/opencode/.git-credentials ] && [ ! -f "${PERSISTENT_HOME}/.git-credentials" ]; then
    cp /home/opencode/.git-credentials "${PERSISTENT_HOME}/.git-credentials"
fi

if [ -d /home/opencode/.config/gh ] && [ ! -d "${PERSISTENT_HOME}/.config/gh" ]; then
    mkdir -p "${PERSISTENT_HOME}/.config"
    cp -R /home/opencode/.config/gh "${PERSISTENT_HOME}/.config/gh"
fi

ln -sfn "${PERSISTENT_HOME}/.config" /home/opencode/.config
ln -sfn "${PERSISTENT_HOME}/.cache" /home/opencode/.cache
ln -sfn "${PERSISTENT_HOME}/.local" /home/opencode/.local

if [ -f "${PERSISTENT_HOME}/.gitconfig" ]; then
    ln -sfn "${PERSISTENT_HOME}/.gitconfig" /home/opencode/.gitconfig
fi

if [ -f "${PERSISTENT_HOME}/.git-credentials" ]; then
    ln -sfn "${PERSISTENT_HOME}/.git-credentials" /home/opencode/.git-credentials
fi

export HOME="${PERSISTENT_HOME}"

echo "=== nova-opencode ==="
echo "  Caddy proxy     : port 8080 (path: ${BASE_PATH})"
echo "  OpenCode web UI : port ${OPENCODE_PORT} (internal)"
echo "  MCP bridge      : port ${MCP_BRIDGE_PORT} (internal)"
echo "  Workspace       : /workspace"
echo "  Home            : ${HOME}"
echo "====================="

# Trap to clean up background processes
cleanup() {
    echo "Shutting down..."
    kill "$MCP_PID" "$OPENCODE_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start the MCP bridge server in the background
python3 /app/mcp_bridge.py &
MCP_PID=$!

# Start OpenCode web UI in the background.
env \
    opencode web \
    --port "${OPENCODE_PORT}" \
    --hostname 127.0.0.1 \
    --cors "*" &
OPENCODE_PID=$!

# Give services a moment to start
sleep 2

# Start Caddy reverse proxy in the foreground.
# Caddy needs its own config/data dirs — use per-process env vars
# to avoid conflicting with OpenCode's XDG directories.
exec env XDG_CONFIG_HOME=/caddy/config XDG_DATA_HOME=/caddy/data \
    caddy run --config /app/Caddyfile --adapter caddyfile
