# What changed since the rejected submission

This file explains, for a reviewer, what the project was when it was rejected,
what it is now, and why the difference is structural rather than cosmetic. Every
claim below is checkable against this repository's history.

## Short version

The rejected submission was **StellarStream**: a payment-streaming contract.
Streaming payroll is a crowded category on every chain, the repo contained one
contract and no working application, and the only Stellar-specific argument for
it was "cheap transactions". That is not a reason to build it on Stellar; it is
a reason to build it anywhere.

The repository has been rebuilt as **Soroban Sentinel**: infrastructure that
exists because of a protocol-level behaviour Stellar has and the other major
smart-contract chains do not — storage expiry. Soroban ledger entries carry a
`liveUntilLedgerSeq`. When a contract's instance entry is archived, the contract
stops accepting calls and balances inside it are frozen until somebody pays to
restore the footprint. Nothing warns the operator. Sentinel makes that deadline
visible, forecastable and CI-enforceable.

The old contract was deleted, not renamed (1,288 lines removed). The new contract
was written from scratch, deployed to testnet, and shipped with a keeper CLI, an
SDK, a docs site and a funded issue backlog.

## Before and after

| | Rejected submission (StellarStream) | Current submission (Soroban Sentinel) |
| --- | --- | --- |
| Problem | Continuous payment streams | Contract state silently archived; funds frozen |
| Why Stellar | Transaction cost | State rent with a protocol-defined expiry and permissionless restoration |
| Contracts | 1 (`contracts/stream`), 1,288 lines, deleted in `46a1168` | 1 (`contracts/registry`), 564 lines, written from scratch |
| On-chain surface | Stream records, token custody, admin role | Public watchlist: no funds, no admin, no upgrade path |
| Application layer | "lives in a separate repository" — not built | CLI (325 lines), SDK (937 lines), deploy script, daily CI scan |
| Deployment | None recorded | Testnet registry `CC4TQFW5GLQ…W6O`, wasm `c1ed6c44…862c`, seeded watchlist |
| Tests | Contract unit tests | 9 contract tests + 10 SDK tests, all green in CI |
| Docs | README + spec | Docs site (6 pages), 5 docs files, contract spec with invariants |
| Contributor surface | One contract | 10 scoped, labelled issues across contract / CLI / infra |

## Why the previous submission was weak

Being explicit about this, because an appeal that only lists new files is not an
appeal:

1. **The idea was not Stellar-specific.** Linear vesting streams exist on
   Ethereum, Solana and every L2. The contract could have been ported anywhere
   with no redesign, which means Stellar gained nothing that was not already
   available.
2. **The hard part was missing.** The repo was the easy half. Custody, indexing
   and the UI — the parts that decide whether anyone uses it — were deferred to
   a second repository that did not exist.
3. **No deployed state.** A grant reviewer could read the code but could not
   use the product, and nothing forced the maintainers to keep it alive.
4. **Thin differentiation from approved repos.** Escrow and streaming were
   already represented in the ecosystem.

## What was built instead

### Deleted

`46a1168` removes `contracts/stream` entirely: `lib.rs` (266), `test.rs` (807),
`events.rs` (80), `storage.rs` (70), `types.rs` (29), `error.rs` (19),
`admin.rs` (17). The token-holding, admin-gated streaming contract and its mock
token test suite are gone. Nothing was carried over.

### Contract — `sentinel-registry`

A permissionless watchlist. `watch` requires the owner's signature, `unwatch`
requires the same owner, `list` pages by monotonic id, `count`/`active_count`
expose totals. There is no admin key, no upgrade entry point, and no token call,
so the contract cannot be drained or repurposed. It extends its own instance and
persistent TTLs on every read and write, because a watchdog that expires is
worse than none.

The design constraint that makes the product possible: the instance ledger key
is derivable from a contract id alone, so any contract can be monitored without
its authors' cooperation or knowledge of its storage layout.

### Keeper — CLI and SDK

`sentinel scan` reads `liveUntilLedgerSeq`, converts ledgers to a wall-clock
deadline against the 5-second close time, and classifies it `OK` / `WATCH` /
`URGENT` / `CRITICAL` / `ARCHIVED`. `sentinel verify` turns that into an exit
code so a scheduled job becomes a deadline reminder instead of a dashboard
nobody reads. Both run on Node 22.6 with no build step and a single dependency.

### Proof it runs

The registry is live on testnet and watches itself, so the first command a
reviewer runs on a fresh clone produces real output:

```console
$ node packages/cli/src/index.ts scan
Soroban Sentinel · testnet · ledger 5515284
STATE     LABEL                         CONTRACT      EXPIRES IN  ESTIMATED EXPIRY
URGENT    Sentinel registry (self)      CC4TQFW5GLQT      6d 23h  2026-11-09 06:13
OK        Native XLM Stellar Asset Con  CDLZFC3SYJYD    170d 21h  2027-04-22 03:50
```

A daily workflow runs the same scan and fails when a watched contract is
critical or archived, so the repo demonstrates the product on itself.

### Reviewability

`docs/CONTRACT_SPEC.md` is the contract's source of truth: storage keys, six
numbered error codes, two events, every function with auth and effects, five
invariants, and an explicit out-of-scope list. `docs/ARCHITECTURE.md` explains
why persistent data keys cannot be enumerated from RPC today and what the
roadmap item to fix that actually requires.

### Ongoing work, not a one-off

`scripts/create-issues.sh` files ten issues in one run, labelled and scoped:
`sentinel restore` from the simulation preamble, maxEntryTtl-aware risk,
two-endpoint cross-check, watch ownership transfer, event payload tests, report
snapshots, footprint indexer, archival runbook, release artifacts, status
dashboard. Each carries acceptance criteria and a roadmap version. The roadmap
is sequenced by dependency, not by wish.

## What is still not done

Stated plainly so the appeal does not overclaim:

- **No mainnet deployment.** The contract is immutable, so it ships only after
  review by someone other than its author. The sequence is in
  `docs/DEPLOYMENT.md`.
- **Unaudited.** `SECURITY.md` says so, lists the trust boundaries, and notes
  that a malicious RPC can report optimistic TTLs.
- **No demo video yet.** It is the remaining submission item.
- **A single maintainer.** The issue backlog is written so contributors can take
  scoped work without maintainer context.

## Two-minute verification

```bash
git clone https://github.com/Streams-Hq/soroban-sentinel.git
cd soroban-sentinel && npm install
node packages/cli/src/index.ts scan                  # live testnet TTLs
node packages/cli/src/index.ts registry list         # the on-chain watchlist
npm test                                             # 10 SDK tests
git show --stat 46a1168                              # the rebuild, in full
```

Contract: [stellar.expert testnet](https://stellar.expert/explorer/testnet/contract/CC4TQFW5GLQTOKWTDE7IJWPQFWJ4NWVMJGBFWB76PUP3T7CEOVVSQW6O) ·
Docs: <https://streams-hq.github.io/soroban-sentinel/> ·
Spec: [`docs/CONTRACT_SPEC.md`](docs/CONTRACT_SPEC.md)

## Text for the appeal form

> The previous submission, StellarStream, was a payment-streaming contract whose
> only Stellar-specific advantage was transaction cost, and whose application
> layer was deferred to a repository that did not exist. It was rebuilt from
> scratch. The new project, Soroban Sentinel, addresses a failure mode that only
> exists because Soroban storage expires: a contract whose instance entry is
> archived stops accepting calls and freezes its balances with no warning to its
> operator. Sentinel pairs a deployed, fundless, adminless watchlist contract on
> testnet with a keeper CLI and SDK that forecast archival deadlines and fail CI
> before a contract goes dark. The previous contract and its tests were deleted
> (1,288 lines removed in one commit); the new contract, tooling, docs site, CI
> and ten-issue contributor backlog replace them. The tool is demonstrated on
> the repository itself, which scans and gates its own deployment daily.
