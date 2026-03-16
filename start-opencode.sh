#!/usr/bin/env bash
# start-opencode.sh — entrypoint for nova-opencode container
# Starts Caddy reverse proxy (port 8080), OpenCode web UI (port 4096),
# and MCP bridge server (port 8081).
set -euo pipefail

export BASE_PATH="${BASE_PATH:-/cell/nova-opencode}"
export OPENCODE_PORT="${OPENCODE_PORT:-4096}"
export MCP_BRIDGE_PORT="${MCP_BRIDGE_PORT:-8081}"

echo "=== nova-opencode ==="
echo "  Caddy proxy     : port 8080 (path: ${BASE_PATH})"
echo "  OpenCode web UI : port ${OPENCODE_PORT} (internal)"
echo "  MCP bridge      : port ${MCP_BRIDGE_PORT} (internal)"
echo "  Workspace       : /workspace"
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
# OpenCode uses XDG conventions — default XDG_DATA_HOME is ~/.local/share
# which is writable for the opencode user.  We don't override it here.
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
