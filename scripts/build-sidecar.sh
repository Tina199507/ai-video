#!/usr/bin/env bash
# ── Build the Node.js backend as a standalone binary for Electron sidecar ──
#
# This script bundles apps/server/src/main.ts into a standalone
# executable using the `bun build --compile` command, or falls back
# to `pkg` if bun is not available. The output binary is placed in
# apps/desktop/resources so it is bundled with the Electron desktop
# app (post direction A-3 physical move from browser-shell/ to
# apps/desktop/).
#
# It also installs Playwright Chromium and copies the browser binary
# into apps/desktop/resources/browsers so it is bundled with the
# desktop app.
#
# Usage:
#   ./scripts/build-sidecar.sh
#
# Prerequisites:
#   - bun (recommended) or @vercel/pkg globally installed
#   - Node.js 20+

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/apps/desktop/resources"
SERVER_ENTRY="$ROOT_DIR/apps/server/src/main.ts"

mkdir -p "$OUTPUT_DIR"

BINARY_NAME="ai-video-server"

# Windows executables need .exe suffix
if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* ]]; then
  BINARY_NAME="${BINARY_NAME}.exe"
fi

echo "Building sidecar binary..."
echo "Output: $OUTPUT_DIR/$BINARY_NAME"
echo "Entry:  $SERVER_ENTRY"

cd "$ROOT_DIR"

# ── Strategy 1: Use bun if available ──
if command -v bun &>/dev/null; then
  echo "Using bun to compile standalone binary..."
  bun build "$SERVER_ENTRY" --compile --outfile "$OUTPUT_DIR/$BINARY_NAME"
  echo "✅ Sidecar built with bun: $BINARY_NAME"
# ── Strategy 2: Use esbuild + pkg ──
elif command -v npx &>/dev/null; then
  echo "Using esbuild + pkg..."
  
  # Bundle TypeScript into a single JS file
  npx esbuild "$SERVER_ENTRY" --bundle --platform=node --target=node20 \
    --outfile="$OUTPUT_DIR/server.cjs" --format=cjs \
    --external:playwright --external:@google/genai

  # Package into standalone binary
  npx -y @yao-pkg/pkg "$OUTPUT_DIR/server.cjs" \
    --target node20 \
    --output "$OUTPUT_DIR/$BINARY_NAME"

  rm -f "$OUTPUT_DIR/server.cjs"
  echo "✅ Sidecar built with pkg: $BINARY_NAME"
else
  echo "❌ Neither bun nor npx found. Cannot build sidecar binary."
  exit 1
fi

# ── Bundle Playwright Chromium ──
echo ""
echo "Installing Playwright Chromium for bundling..."
npx playwright install chromium

# Locate the Playwright browser directory
PW_BROWSERS="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"
CHROMIUM_SRC=""
if [[ -d "$PW_BROWSERS" ]]; then
  CHROMIUM_SRC=$(find "$PW_BROWSERS" -maxdepth 1 -name 'chromium-*' -type d | sort -V | tail -1)
fi

if [[ -n "$CHROMIUM_SRC" && -d "$CHROMIUM_SRC" ]]; then
  CHROMIUM_BASENAME="$(basename "$CHROMIUM_SRC")"
  BROWSERS_DIR="$OUTPUT_DIR/browsers"
  rm -rf "$BROWSERS_DIR"
  mkdir -p "$BROWSERS_DIR"
  cp -r "$CHROMIUM_SRC" "$BROWSERS_DIR/$CHROMIUM_BASENAME"
  echo "✅ Chromium bundled into: $BROWSERS_DIR/$CHROMIUM_BASENAME"
else
  echo "⚠️  Could not locate Playwright Chromium browsers directory."
  echo "   Chromium will not be bundled — users will need to install it manually."
fi

# ── Emit sidecar-manifest.json so Electron can verify the shipped   ──
# ── artifacts haven't been tampered with between build and launch.   ──
echo ""
echo "Computing sidecar manifest hashes..."

GIT_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo 'unknown')"
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
MANIFEST_PATH="$OUTPUT_DIR/sidecar-manifest.json"

BINARY_PATH="$OUTPUT_DIR/$BINARY_NAME"
if [[ ! -f "$BINARY_PATH" ]]; then
  echo "❌ Expected binary at $BINARY_PATH but it is missing; manifest not written."
  exit 1
fi
BINARY_SIZE="$(wc -c < "$BINARY_PATH" | tr -d ' ')"
if command -v sha256sum &>/dev/null; then
  BINARY_SHA="$(sha256sum "$BINARY_PATH" | awk '{print $1}')"
elif command -v shasum &>/dev/null; then
  BINARY_SHA="$(shasum -a 256 "$BINARY_PATH" | awk '{print $1}')"
else
  echo "❌ Neither sha256sum nor shasum available on PATH."
  exit 1
fi

# Hash the chromium subtree (if present) via tar | sha256sum.
# Using `find -print0 | sort -z` keeps the hash stable regardless of
# filesystem iteration order.
CHROMIUM_SHA=""
CHROMIUM_BASENAME_OUT=""
if [[ -d "${OUTPUT_DIR}/browsers" ]]; then
  pushd "$OUTPUT_DIR/browsers" >/dev/null
  CHROMIUM_DIR_OUT=$(find . -maxdepth 1 -name 'chromium-*' -type d | sort -V | tail -1)
  if [[ -n "$CHROMIUM_DIR_OUT" ]]; then
    CHROMIUM_BASENAME_OUT="$(basename "$CHROMIUM_DIR_OUT")"
    if command -v sha256sum &>/dev/null; then
      CHROMIUM_SHA="$(find "$CHROMIUM_DIR_OUT" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
    else
      CHROMIUM_SHA="$(find "$CHROMIUM_DIR_OUT" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
    fi
  fi
  popd >/dev/null
fi

cat > "$MANIFEST_PATH" <<JSON
{
  "schemaVersion": 1,
  "gitSha": "$GIT_SHA",
  "builtAt": "$BUILT_AT",
  "binary": {
    "name": "$BINARY_NAME",
    "size": $BINARY_SIZE,
    "sha256": "$BINARY_SHA"
  },
  "chromium": {
    "dir": "$CHROMIUM_BASENAME_OUT",
    "sha256": "$CHROMIUM_SHA"
  }
}
JSON

echo "✅ Wrote $MANIFEST_PATH"
cat "$MANIFEST_PATH"
