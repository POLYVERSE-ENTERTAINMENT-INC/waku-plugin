#!/usr/bin/env bash
# Waku SessionStart bootstrap — idempotent, fail-open, no nag.
#
#   1) Ensure the Waku CLI is installed (skip silently if already present).
#   2) If NOT logged in, print ONE gentle hint. If logged in, stay completely silent.
#
# This NEVER blocks the session, NEVER opens a browser, and NEVER re-installs when the
# CLI is already there. Login is otherwise on-demand: commands prompt only when they
# actually need auth and the session can't be silently refreshed.
set -uo pipefail

WAKU_HOME="${WAKU_INSTALL_DIR:-$HOME/.waku}"
REAL="$WAKU_HOME/bin/waku"
INSTALL_URL="https://storage.googleapis.com/samantha-app-pv-samantha-site-artifacts-asia-east1/waku-cli/install.sh"

if [ ! -x "$REAL" ]; then
  echo "[waku] first run — installing the Waku CLI ..." >&2
  curl -fsSL "$INSTALL_URL" | WAKU_NO_LOGIN=1 WAKU_NO_MCP=1 WAKU_INSTALL_SKILLS=0 bash >/dev/null 2>&1 || true
fi

if [ -x "$REAL" ]; then
  if ! "$REAL" whoami >/dev/null 2>&1; then
    echo "[waku] 未登录 — 运行 /waku:login（或 \`waku login\`）即可开始创作 / 发布。" >&2
  fi
fi

exit 0
