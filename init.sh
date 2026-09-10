#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

for tool in node pnpm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing $tool. See README.md for prerequisites." >&2
    exit 1
  fi
done

echo "Preparing Sabr & Steps in $PWD"
pnpm install --frozen-lockfile
pnpm check
echo "Checks passed. Set up persistence with: pnpm db:configure, pnpm db:up, pnpm db:migrate"
echo "Start the web app with: pnpm dev --hostname 127.0.0.1"
echo "See PROGRESS.md for the implemented features and next action."
