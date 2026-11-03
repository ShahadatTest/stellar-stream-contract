#!/usr/bin/env bash
#
# Apply the repository settings a reviewer looks at: topics, branch
# protection on main, and the v0.1.0 release carrying the deployed wasm hash.
#
# Run from the repository root with an authenticated gh CLI that has admin on
# the repo:
#   bash scripts/setup-repo.sh
#
# Safe to re-run. Pushes no code.

set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
BRANCH="${BRANCH:-main}"

echo "repo: $REPO"

# ---------------------------------------------------------------------------
# Topics
# ---------------------------------------------------------------------------
gh repo edit "$REPO" \
  --add-topic stellar \
  --add-topic soroban \
  --add-topic soroban-smart-contracts \
  --add-topic stellar-ecosystem \
  --add-topic ttl \
  --add-topic state-archival \
  --add-topic cli \
  --add-topic typescript \
  --add-topic rust \
  --add-topic monitoring \
  >/dev/null
echo "topics : set"

# ---------------------------------------------------------------------------
# Branch protection
#
# Required checks must match the job names in .github/workflows/ci.yml
# ("Contracts (Rust)", "SDK + CLI (Node)"). A name that does not exist leaves
# every PR waiting forever, so they are read from the workflow rather than
# typed from memory.
# ---------------------------------------------------------------------------
mapfile -t CHECKS < <(grep -E '^    name: ' .github/workflows/ci.yml | sed 's/^    name: //')

if [ "${#CHECKS[@]}" -eq 0 ]; then
  echo "error: no CI job names found in .github/workflows/ci.yml" >&2
  exit 1
fi

echo "checks : ${CHECKS[*]}"

checks_json="$(printf '%s\n' "${CHECKS[@]}" | jq -R . | jq -s .)"

gh api --method PUT "repos/$REPO/branches/$BRANCH/protection" \
  --input - >/dev/null <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": $checks_json
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF
echo "branch : $BRANCH protected, PR + ${#CHECKS[@]} required checks"

# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------
TAG="${TAG:-v0.1.0}"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "release: $TAG already exists"
else
  REGISTRY="$(jq -r '.registry' deployments.json)"
  WASM_HASH="$(jq -r '.wasmHash' deployments.json)"
  NETWORK="$(jq -r '.network' deployments.json)"

  gh release create "$TAG" --repo "$REPO" --title "$TAG" --notes "$(cat <<EOF
First tracked release of the Sentinel registry.

| Field | Value |
| --- | --- |
| Network | $NETWORK |
| Registry | \`$REGISTRY\` |
| Wasm hash | \`$WASM_HASH\` |
| Explorer | https://stellar.expert/explorer/$NETWORK/contract/$REGISTRY |

Rebuild with \`make wasm\` and compare \`sha256sum\` against the wasm hash above to
verify the deployed code matches this tag.

The contract has no upgrade path: a behaviour change ships as a new contract id.
EOF
)"
  echo "release: $TAG created"
fi

# ---------------------------------------------------------------------------
# Labels and issues are handled separately by scripts/create-issues.sh.
# ---------------------------------------------------------------------------
echo
echo "next   : bash scripts/create-issues.sh   (files the issue backlog)"
