#!/usr/bin/env zsh
set -euo pipefail

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install Joern on this machine."
  exit 1
fi

brew install joern
which joern
joern --help | head -n 20
