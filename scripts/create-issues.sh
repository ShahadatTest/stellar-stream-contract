#!/usr/bin/env bash
#
# Seed the Drips Wave issue backlog for stellar-stream-contract.
#
# Run once, from the repository root, with an authenticated gh CLI:
#   bash scripts/create-issues.sh
#
# The script is safe to re-run: an issue whose title already exists in an open
# issue is skipped. It creates labels first, then issues.
#
# Nothing here touches main or pushes code. It only opens issues.

set -euo pipefail

REPO="${REPO:-Deyanju23/stellar-stream-contract}"

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------
echo "Creating/updating labels on $REPO ..."

label() {
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null
}

label "Stellar Wave"     "7B3FE4" "Part of the Stellar Drips Wave program"
label "good first issue" "7057FF" "Scoped, low-risk, good starting point"
label "complexity: low"  "C2E0C6" "Roughly a day of work"
label "complexity: mid"  "FEF2C0" "A few days of work"
label "complexity: high" "F9D0C4" "Touches core behavior; needs care"
label "type: bug"        "D73A4A" "Incorrect or risky behavior"
label "type: test"       "1D76DB" "Adds or improves tests"
label "type: docs"       "0075CA" "Documentation only"
label "type: ci"         "5319E7" "CI / build / tooling"

# ---------------------------------------------------------------------------
# Issues
# ---------------------------------------------------------------------------
created=0
skipped=0

create_issue() {
  local title="$1" labels="$2" body="$3"
  if gh issue list --repo "$REPO" --state open --search "$title in:title" \
      --json title --jq '.[].title' | grep -Fxq "$title"; then
    echo "skip   : $title"
    skipped=$((skipped + 1))
    return
  fi
  # `gh issue create` takes one repeated -l per label, so split the
  # comma-separated list into individual flags.
  local label_args=()
  local part
  IFS=',' read -ra parts <<< "$labels"
  for part in "${parts[@]}"; do
    label_args+=(-l "$part")
  done

  gh issue create --repo "$REPO" --title "$title" "${label_args[@]}" --body "$body" >/dev/null
  echo "create : $title"
  created=$((created + 1))
}

create_issue \
  "test(stream): add authorization-rejection tests" \
  "Stellar Wave,type: test,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

Most tests call `env.mock_all_auths()`, so nothing proves the access control
works. `init` now has a rejection test; `withdraw` and `cancel` do not.

## Acceptance Criteria

- [ ] A non-recipient calling `withdraw` is rejected
- [ ] A non-sender calling `cancel` is rejected
- [ ] `create_stream` requires the sender's auth
- [ ] These tests do not enable all auths

## Tech Stack

Rust, soroban-sdk 28.x, per-address auth mocking.

## Context

Hardening backlog H1 in `docs/CONTRACT_SPEC.md`.
EOF
)"

create_issue \
  "test(stream): assert emitted events" \
  "Stellar Wave,type: test,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

`StreamCreated`, `TokensWithdrawn`, and `StreamCanceled` are emitted but never
asserted. A typo in a payload would pass every current test.

## Acceptance Criteria

- [ ] One test per event asserting the full payload
- [ ] Tests use the SDK's event test utilities to read published events
- [ ] Payload fields match `docs/CONTRACT_SPEC.md` section 3

## Tech Stack

Rust, soroban-sdk 28.x, `Env::events()` in tests.

## Context

Hardening backlog H2 in `docs/CONTRACT_SPEC.md`.
EOF
)"

create_issue \
  "ci(contracts): attach wasm artifact to tagged releases" \
  "Stellar Wave,type: ci,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

CI builds the release wasm via `stellar contract build`, but tagged releases do
not publish it. A release should carry the exact artifact that was deployed so
reviewers can verify the hash.

## Acceptance Criteria

- [ ] On a `v*` tag, the workflow uploads `stellar_stream.wasm` to the release
- [ ] The artifact is accompanied by its wasm hash
- [ ] The release body lists the deployed contract ID(s)

## Tech Stack

GitHub Actions, `softprops/action-gh-release` or equivalent.

## Context

Builds on the `wasm` job in `.github/workflows/ci.yml`.
EOF
)"

create_issue \
  "docs(contracts): reconcile README and spec after changes" \
  "Stellar Wave,type: docs,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

The README and `docs/CONTRACT_SPEC.md` must stay in lockstep with the code. This
tracks the reconciliation pass once the contracts are deployed.

## Acceptance Criteria

- [ ] README interface table matches the deployed ABI
- [ ] Spec section 4 matches the code function by function
- [ ] Deployed contract ID and explorer link added once live
- [ ] Completed backlog items removed from the spec

## Tech Stack

Markdown.

## Context

Phase 10/11 documentation hygiene.
EOF
)"

create_issue \
  "feat(stream): add withdraw_all convenience function" \
  "Stellar Wave,complexity: mid" \
  "$(cat <<'EOF'
## Summary

A recipient who wants everything accrued must call `balance_of`, then `withdraw`
with that exact figure — two round trips, and a race if time passes between
them. `withdraw_all(stream_id)` computes and transfers the available amount in
one call.

## Acceptance Criteria

- [ ] `withdraw_all(stream_id)` withdraws `earned - recipient_withdrawn`
- [ ] Auth matches `withdraw` (recipient only)
- [ ] Defined behavior when the available amount is 0
- [ ] Emits the same `TokensWithdrawn` event as `withdraw`
- [ ] `docs/CONTRACT_SPEC.md` updated
- [ ] Tests cover mid-stream, after-stop, and 0-available cases

## Tech Stack

Rust, soroban-sdk 28.x.
EOF
)"

create_issue \
  "feat(stream): expose per-address stream index" \
  "Stellar Wave,complexity: high" \
  "$(cat <<'EOF'
## Summary

The contract only supports lookup by id. A frontend showing "my streams" must
scan every id, which does not scale and forces an indexer to reconstruct a
mapping from events. A per-address index makes that a direct read.

## Acceptance Criteria

- [ ] `DataKey` gains entries for streams created by / assigned to an address
- [ ] `create_stream` appends to both indexes
- [ ] A read function returns the id list for an address (paged if needed)
- [ ] Persistent TTL for index entries is extended on write
- [ ] Storage growth and gas are documented in the spec
- [ ] Tests cover multiple streams across multiple addresses

## Design note

Decide and document: unbounded `Vec` per address, or paged buckets. The former
is simpler but has a growing read cost.

## Tech Stack

Rust, soroban-sdk 28.x.

## Depends on

Should land before the app repo builds an indexer that depends on it.
EOF
)"

echo
echo "Done. created=$created skipped=$skipped"
