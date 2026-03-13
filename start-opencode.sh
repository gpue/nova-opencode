#!/usr/bin/env bash
# start-opencode.sh — entrypoint for nova-opencode container
# Starts OpenCode web UI and the MCP bridge server side-by-side.
set -euo pipefail

OPENCODE_PORT="${OPENCODE_PORT:-4096}"
MCP_BRIDGE_PORT="${MCP_BRIDGE_PORT:-8080}"
BASE_PATH="${BASE_PATH:-/cell/nova-opencode}"

echo "=== nova-opencode ==="
echo "  OpenCode web UI : port ${OPENCODE_PORT} (path: ${BASE_PATH})"
echo "  MCP bridge      : port ${MCP_BRIDGE_PORT} (path: ${BASE_PATH}/mcp)"
echo "  Workspace       : /workspace"
echo "====================="

# Start the MCP bridge server in the background
python3 /app/mcp_bridge.py &
MCP_PID=$!

# Start OpenCode web UI in the foreground
# --hostname 0.0.0.0 binds to all interfaces for K8s
# --cors allows cross-origin access from the Nova gateway
exec opencode web \
    --port "${OPENCODE_PORT}" \
    --hostname 0.0.0.0 \
    --cors "*"
