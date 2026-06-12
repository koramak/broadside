#!/bin/sh
# Launcher for the preview tool: puts the local Node toolchain on PATH.
export PATH="$HOME/.local/node-toolchain/node-v22.16.0-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
exec npm run dev
