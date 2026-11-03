#!/usr/bin/env bash
#
# Seed the public issue backlog for soroban-sentinel.
#
# Run once from the repository root with an authenticated gh CLI:
#   bash scripts/create-issues.sh
#
# Safe to re-run: an issue whose title already exists in an open issue is
# skipped. Creates labels first, then issues. Nothing here pushes code.

set -euo pipefail

# Derive the slug from the checkout so a repo rename never breaks the script.
REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo Streams-Hq/soroban-sentinel)}"

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------
echo "Creating/updating labels on $REPO ..."

label() {
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null
}

label "good first issue" "7057FF" "Scoped, low-risk, good starting point"
label "complexity: low"  "C2E0C6" "Roughly a day of work"
label "complexity: mid"  "FEF2C0" "A few days of work"
label "complexity: high" "F9D0C4" "Touches core behaviour; needs care"
label "type: feat"       "0E8A16" "New capability"
label "type: bug"        "D73A4A" "Incorrect or risky behaviour"
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
  if gh issue list --repo "$REPO" --state all --search "$title in:title" \
      --json title --jq '.[].title' | grep -Fxq "$title"; then
    echo "skip   : $title"
    skipped=$((skipped + 1))
    return
  fi

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
  "feat(cli): add 'sentinel restore' for archived entries" \
  "type: feat,complexity: high" \
  "$(cat <<'EOF'
## Summary

`sentinel scan` tells you an entry is gone, but does not fix it. Restoration is a
`RestoreFootprint` operation that anyone can submit, so the CLI should be able to
do it.

## Acceptance Criteria

- [ ] `sentinel restore --contract C...` builds a `RestoreFootprint` transaction
- [ ] The footprint comes from a simulation response's `restorePreamble.transactionData`
- [ ] Dry-run by default: prints the envelope XDR and `minResourceFee`, submits only with `--submit`
- [ ] Fails clearly when nothing needs restoring
- [ ] Waits for the transaction and prints the hash and explorer link
- [ ] Docs in `docs/CLI.md` + a test for the "nothing to restore" path

## Tech Stack

TypeScript, `@stellar/stellar-sdk` 17.x, `Operation.restoreFootprint`,
`Server.prepareTransaction`.

## Context

Roadmap v0.2. The tricky part is that an archived entry cannot be read, so the
footprint has to come from simulation rather than from `getLedgerEntries`.
EOF
)"

create_issue \
  "feat(sdk): stop reporting URGENT when the contract is at maxEntryTtl" \
  "type: bug,complexity: mid" \
  "$(cat <<'EOF'
## Summary

A reading can never exceed the network's `maxEntryTtl`. On testnet that cap is
about 7 days, so a contract that was just written reads `URGENT` against the
default 30-day warn window. That is a false alarm: the contract is as alive as
the protocol allows it to be.

## Acceptance Criteria

- [ ] Read the network cap (RPC network info, or a documented constant per network)
- [ ] A contract at/above ~95% of the cap is never classified `URGENT`/`CRITICAL`
- [ ] The report distinguishes "at network ceiling" from "genuinely expiring"
- [ ] `--warn-ledgers` above the cap warns once instead of mislabelling everything
- [ ] Unit tests cover cap == warn window, cap < warn window, and cap unknown

## Tech Stack

TypeScript, `packages/sdk/src/ttl.ts` (pure functions, no network in tests).

## Context

Visible in the very first live scan: the registry itself reads URGENT at 120,952
ledgers because that is the testnet ceiling.
EOF
)"

create_issue \
  "feat(cli): cross-check TTLs across two RPC endpoints" \
  "type: feat,complexity: mid" \
  "$(cat <<'EOF'
## Summary

Every forecast depends on one RPC endpoint. A stale or malicious endpoint can
report an optimistic `liveUntilLedgerSeq` and hide a contract that is about to
be archived.

## Acceptance Criteria

- [ ] `--rpc-url` stays; add `--rpc-url-2` or a comma-separated list
- [ ] Queries run in parallel and results are compared per key
- [ ] Any disagreement wider than N ledgers is reported as a distinct state
- [ ] `verify` fails on disagreement when `--strict` is set
- [ ] A single failing endpoint degrades to the other instead of aborting
- [ ] Docs + tests with a stubbed server

## Tech Stack

TypeScript, `@stellar/stellar-sdk` RPC client.

## Context

Roadmap v0.2. This is the difference between a dashboard and infrastructure.
EOF
)"

create_issue \
  "feat(registry): allow transferring watch ownership" \
  "type: feat,complexity: mid" \
  "$(cat <<'EOF'
## Summary

If a team rotates keys, every watch becomes unremovable: `unwatch` requires the
original owner's signature and there is no transfer path.

## Acceptance Criteria

- [ ] `transfer(owner, target, new_owner)` requires the current owner's auth
- [ ] Rejects unknown targets (`NotFound`) and mismatched owners (`Unauthorized`)
- [ ] Keeps the same watch id and event-stream contract
- [ ] Emits a `WatchTransferred { target, from, to }` event
- [ ] `docs/CONTRACT_SPEC.md` updated; invariants still hold
- [ ] Tests: success, non-owner rejection, transfer to the same address

## Tech Stack

Rust, soroban-sdk 28.x, `contracts/registry/src/lib.rs`.

## Context

Roadmap v0.3. Any ABI change needs the spec updated in the same PR.
EOF
)"

create_issue \
  "test(registry): assert emitted event payloads" \
  "type: test,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

`WatchAdded` and `WatchRemoved` are emitted but never asserted, so a typo in a
field name would pass every current test.

## Acceptance Criteria

- [ ] One test per event asserting the full payload
- [ ] Uses the SDK's event helpers to read published events
- [ ] Fields match `docs/CONTRACT_SPEC.md` section 3
- [ ] Fails if an extra event is emitted by one call

## Tech Stack

Rust, soroban-sdk 28.x testutils, `contracts/registry/src/test.rs`.

## Context

The contract currently has 9 tests; none read the event log.
EOF
)"

create_issue \
  "test(cli): snapshot the human and JSON report formats" \
  "type: test,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

`renderText` and `renderJson` are the product's only interface for most users,
and no test pins their shape. A column change silently breaks downstream parsers.

## Acceptance Criteria

- [ ] Fixture `ScanResult` covering all five risk states
- [ ] Snapshot assertions for `renderText` with colour off
- [ ] JSON schema assertions for `renderJson` (fields, types, nullability)
- [ ] Tests run with `node --test`, no network

## Tech Stack

Node test runner, `packages/sdk/test/`.

## Context

`packages/sdk/src/report.ts` is pure; only the ANSI flag needs pinning.
EOF
)"

create_issue \
  "feat: enumerate a contract's persistent keys with a footprint indexer" \
  "type: feat,complexity: high" \
  "$(cat <<'EOF'
## Summary

Today only the instance entry can be monitored without cooperation: RPC returns
exactly the keys you ask for, and persistent data keys are contract-specific.
An indexer should derive them so operators get per-record deadlines.

## Acceptance Criteria

- [ ] Stream `WatchAdded`/`WatchRemoved` from Soroban RPC `getEvents`
- [ ] Track which storage keys each watched contract touches, from `fn_call` and
      contract-data events
- [ ] Persist an index (SQLite or JSON) that `sentinel scan` can consume
- [ ] `scan` reports per-key deadlines when the index has them
- [ ] Document the accuracy limits (a key never touched in the event window is invisible)

## Tech Stack

TypeScript, Soroban RPC `getEvents`, local persistence.

## Context

Roadmap v0.3. Depends on nothing else, but is the largest single item.
EOF
)"

create_issue \
  "docs: write an archival runbook" \
  "type: docs,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

When a scan turns red, the operator needs a checklist, not a risk table. There is
no runbook yet for "my contract is archived, now what".

## Acceptance Criteria

- [ ] New `docs/RUNBOOK.md` covering: confirm with `getLedgerEntries`, extend from
      the owning contract, restore the footprint, verify afterwards
- [ ] Explains who can extend (owner only) vs who can restore (anyone who pays)
- [ ] Includes the exact CLI commands and their expected output
- [ ] Linked from `README.md` and the docs site

## Tech Stack

Markdown, real testnet commands.

## Context

Pairs naturally with the `sentinel restore` issue.
EOF
)"

create_issue \
  "ci: publish the wasm artifact and hash on tagged releases" \
  "type: ci,complexity: low,good first issue" \
  "$(cat <<'EOF'
## Summary

CI builds the wasm but releases do not carry it, so nobody can verify that the
deployed contract matches the source at a tag.

## Acceptance Criteria

- [ ] On a `v*` tag, attach `sentinel_registry.wasm` and `wasm.sha256` to the release
- [ ] The release body lists the deployed contract id(s) from `deployments.json`
- [ ] The hash in the release body matches `deployments.json` for that version

## Tech Stack

GitHub Actions, `softprops/action-gh-release` or equivalent.

## Context

Builds on the `contracts` job in `.github/workflows/ci.yml`.
EOF
)"

create_issue \
  "feat(cli): static status dashboard generated from scan output" \
  "type: feat,complexity: mid" \
  "$(cat <<'EOF'
## Summary

A public page per deployment would let users answer "is this contract still
alive?" without installing anything.

## Acceptance Criteria

- [ ] `sentinel report --json scan.json --out site/status/` writes static HTML
- [ ] Page lists every watched contract, state, deadline and explorer link
- [ ] Regenerated by the scheduled workflow and deployed to GitHub Pages
- [ ] No client-side JS required to read it
- [ ] Accessible states: colour is not the only signal

## Tech Stack

TypeScript, no framework, plain HTML + CSS in `site/`.

## Context

Roadmap v0.4. Uses the same `ScanResult` the JSON output already produces.
EOF
)"

echo
echo "Done. created=$created skipped=$skipped"
