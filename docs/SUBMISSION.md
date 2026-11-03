# Wave submission pack

Everything the Drips Wave submission form asks for, written out so it can be
copied without editing. Links are the deployed values in `deployments.json`.

## Project description (one paragraph)

Soroban contracts can silently stop working. Every ledger entry carries a
`liveUntilLedgerSeq`, and when a contract's instance entry is archived the
contract stops accepting calls — balances are frozen until somebody pays to
restore the footprint. Nothing in the RPC API or the protocol warns an operator
that this is about to happen. Soroban Sentinel makes that deadline visible: a
small fundless, adminless Soroban registry holds a public watchlist of
contracts, and a Node keeper reads the instance entries' TTLs, converts them
into wall-clock expiry dates against Stellar's 5-second close time, classifies
the risk, and exits non-zero in CI before a contract goes dark. The instance key
is derivable from the contract id alone, so any contract can be monitored
without its authors' cooperation.

## Links

| Item | Value |
| --- | --- |
| Live docs site | <https://streams-hq.github.io/soroban-sentinel/> |
| Repository | <https://github.com/Streams-Hq/soroban-sentinel> |
| Contract (testnet) | [`CC4TQFW5GLQTOKWTDE7IJWPQFWJ4NWVMJGBFWB76PUP3T7CEOVVSQW6O`](https://stellar.expert/explorer/testnet/contract/CC4TQFW5GLQTOKWTDE7IJWPQFWJ4NWVMJGBFWB76PUP3T7CEOVVSQW6O) |
| Contract spec | <https://github.com/Streams-Hq/soroban-sentinel/blob/main/docs/CONTRACT_SPEC.md> |
| Issue backlog generator | <https://github.com/Streams-Hq/soroban-sentinel/blob/main/scripts/create-issues.sh> |
| Demo video | **not recorded yet** — see "Before submitting" below |

## Repo relationship

This is a single repository, not a contract/app split. The contract is ~150
lines of Rust that stores one struct and two counters; the application layer is
a Node keeper. Two repos would buy a second Wave surface at the cost of a
versioned ABI between them, and the CLI already treats the registry id as
configuration (`deployments.json`, `SENTINEL_REGISTRY_ID`), so a redeploy never
requires a code change. If the ABI grows past a watchlist, the split becomes
worth it; until then one repo keeps the spec, the code and the tests in a single
review unit.

## Planned issues (already written, ready to file)

`scripts/create-issues.sh` files the whole batch in one run: it creates the
labels first, skips titles that already exist, and pushes nothing. Ten scoped
issues across three areas:

- **Contract** — `transfer` watch ownership between addresses; assert event
  payloads (good first issue).
- **Keeper CLI / SDK** — `sentinel restore` for archived entries; maxEntryTtl-
  aware risk so a contract at the network ceiling is not labelled urgent;
  two-RPC cross-check for lying endpoints; snapshot tests for the report
  renderers (good first issue); static status dashboard from `scan --json`.
- **Infra / docs** — footprint indexer for persistent keys; archival runbook;
  publish the wasm and hash on tagged releases.

Every issue carries a Summary, checkbox acceptance criteria and the exact tech
stack, and maps to a roadmap version in `docs/ROADMAP.md`.

## Before submitting — outstanding items

These are real gaps, not formalities. Do not submit until each is either done or
deliberately waived.

1. **Record the demo.** A terminal capture of `scan` on testnet, a
   `registry add`, and `verify` exiting `2` on an expired contract. Two minutes,
   no editing beyond trimming.
2. **Publish the v0.1.0 release.** The tag exists locally; the GitHub release
   does not. It must carry the wasm hash
   `c1ed6c4473efb0929a711049ebca6e66d4135ed7abb3fcedb753df65fbbe862c` and the
   testnet contract id.
3. **Confirm branch protection.** `scripts/setup-repo.sh` applies it; the
   required checks must be the real job names (`Contracts (Rust)`,
   `SDK + CLI (Node)`) or merges will hang.
4. **Confirm the docs site URL** after the Pages rebuild, and that the repository
   URL in this file and in the README resolves.
