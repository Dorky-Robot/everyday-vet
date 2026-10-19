#!/usr/bin/env bash
# Re-encrypt the strategy page after editing the plaintext source.
#
# Usage:
#   1. Edit strategy/index.src.html (the gitignored plaintext source)
#   2. Run: ./strategy/encrypt.sh '<password>'
#   3. Commit the regenerated strategy/index.html
#
# The salt in .staticrypt.json keeps "Remember me" logins stable across
# re-encryptions — don't delete it.
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 '<password>'" >&2
    exit 1
fi

cd "$(dirname "$0")/.."

OUT=$(mktemp -d)
npx -y staticrypt strategy/index.src.html \
    -p "$1" \
    -d "$OUT" \
    --short \
    --remember 30 \
    --template-title "Everyday Vet — Business Plan" \
    --template-instructions "This business plan is shared privately. Enter the password you were given to view it." \
    --template-button "View Plan" \
    --template-placeholder "Password" \
    --template-error "That password isn't right — double-check and try again." \
    --template-color-primary "#E91E8C" \
    --template-color-secondary "#241328"

cp "$OUT/index.src.html" strategy/index.html
rm -rf "$OUT"
echo "Encrypted page written to strategy/index.html"
