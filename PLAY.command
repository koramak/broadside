#!/bin/sh
# Double-click me to play BROADSIDE.
# Starts the local game server and opens it in your browser.
export PATH="$HOME/.local/node-toolchain/node-v22.16.0-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")" || exit 1
( sleep 3; open "http://localhost:5173" ) &
exec node node_modules/vite/bin/vite.js --port 5173 --strictPort
