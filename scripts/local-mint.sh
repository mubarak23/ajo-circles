#!/usr/bin/env bash
# Local Nutshell test mint with a fake Lightning backend: top-ups pay themselves instantly.
# Usage: ./scripts/local-mint.sh   (then MINT_URL=http://127.0.0.1:3338)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .nutshell ]; then
  python3 -m venv .nutshell
  # Nutshell >= 0.22 uses the SIG_ALL message format cashu-ts 4.13 signs.
  .nutshell/bin/pip install -q "git+https://github.com/cashubtc/nutshell.git"
fi

export MINT_PRIVATE_KEY="ajo-hackathon-test-key-not-secret"
export MINT_BACKEND_BOLT11_SAT=FakeWallet
export FAKEWALLET_BRR=TRUE
export FAKEWALLET_DELAY_PAYMENT=FALSE
export MINT_INPUT_FEE_PPK=0
export MINT_LISTEN_HOST="${MINT_LISTEN_HOST:-0.0.0.0}"
export MINT_LISTEN_PORT="${MINT_LISTEN_PORT:-3338}"
export MINT_DATABASE="$PWD/.nutshell-data"

exec .nutshell/bin/mint
