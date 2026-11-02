# Soroban Sentinel

**Watch Soroban contracts before their state expires.**

Every Soroban storage entry has a time-to-live. When it runs out the entry is
archived, and a contract whose *instance* is archived stops accepting calls
entirely — its balances are frozen until somebody pays to restore the footprint.
Nothing in the RPC API, the CLI, or the network protocol warns an operator that
the deadline is approaching.

Soroban Sentinel turns that deadline into something you can see, forecast, and
put in CI.

```console
$ sentinel scan

Soroban Sentinel · testnet · ledger 5515284

STATE     LABEL                         CONTRACT      EXPIRES IN  ESTIMATED EXPIRY  LEDGERS
-------------------------------------------------------------------------------------------
URGENT    Sentinel registry (self)      CC4TQFW5GLQT      6d 23h  2026-11-09 06:13  120952
OK        Native XLM Stellar Asset Con  CDLZFC3SYJYD    170d 21h  2027-04-22 03:50  2953151

1 healthy · 0 watch · 1 urgent · 0 critical · 0 archived
```

Two halves:

1. **`sentinel-registry`** — a small, fundless, admin-less Soroban contract that
   holds a public watchlist of contracts and who owns them.
2. **`sentinel`** — a CLI + TypeScript SDK that reads `liveUntilLedgerSeq` for
   each watched contract, converts it into a wall-clock expiry, classifies the
   risk, and exits non-zero when something is about to die.

## Why this only exists on Stellar

Soroban has **state rent**: ledger entries are not permanent. Persistent and
instance entries carry a `liveUntilLedgerSeq`, and the whole design of a
contract has to account for it. Stellar is the only major smart-contract
ecosystem where "my contract silently stopped working after a quiet month" is a
real, protocol-level failure mode.

That makes this tooling Stellar-native rather than chain-agnostic:

- The instance ledger key is derivable from the contract id alone, so *any*
  contract can be monitored without its storage layout.
- TTLs move with ledger closes (~5s), so forecasts are ledger arithmetic on
  protocol parameters, not cron approximations.
- Restoration is a `RestoreFootprint` operation, which anyone can pay for — the
  economics only make sense because Soroban archival is permissionless to fix.

## Quick start

Requires Node.js 22.6+ (the CLI runs TypeScript directly; there is no build
step).

```bash
git clone https://github.com/Streams-Hq/stellar-stream-contract.git
cd soroban-sentinel
npm install

# Any contract id on any Stellar network
node packages/cli/src/index.ts scan \
  --contract CC4TQFW5GLQTOKWTDE7IJWPQFWJ4NWVMJGBFWB76PUP3T7CEOVVSQW6O

# Or everything in deployments.json (the default config)
node packages/cli/src/index.ts scan

# Machine-readable, for dashboards and CI
node packages/cli/src/index.ts scan --json
```

Read-only commands need no key: on testnet and futurenet a throwaway account is
funded by friendbot for RPC simulation.

## The watchlist

The registry is public infrastructure: anyone can register a contract, and only
the registering address can remove it. There are no fees, no admin, and no
upgrade authority — it holds no funds.

```bash
# Read the public watchlist
node packages/cli/src/index.ts registry list

# Add your contract (needs SENTINEL_SECRET)
SENTINEL_SECRET=S... node packages/cli/src/index.ts registry add \
  --target CC4TQFW5GLQTOKWTDE7IJWPQFWJ4NWVMJGBFWB76PUP3T7CEOVVSQW6O \
  --label "Payroll streams v2" \
  --warn-ledgers 518400
```

`sentinel scan --registry <id>` then monitors the whole list, so a keeper has one
source of truth for "what should I be watching on this network?".

## CLI

| Command | Purpose |
| --- | --- |
| `scan` | Forecast archival for targets, human or `--json` output |
| `verify` | Same data, exit `2` when a contract is critical or archived |
| `registry list` | Print the on-chain watchlist |
| `registry add` / `remove` | Maintain your own entries |
| `doctor` | RPC health, ledger, protocol, network config |

Full flags, environment variables and exit codes: [`docs/CLI.md`](docs/CLI.md).

## Risk model

| State | Meaning |
| --- | --- |
| `OK` | More than a warn window of ledgers left |
| `WATCH` | Inside the warn window — plan an extension |
| `URGENT` | A third of the window left |
| `CRITICAL` | A tenth of the window left — act now |
| `ARCHIVED` | The entry is not live: archived, or the contract was never deployed |

Readings are capped by the network's `maxEntryTtl`. On testnet that cap is about
seven days, so a contract that was just written can still read `URGENT` against
a 30-day window. That is the cap talking, not your contract — set
`--warn-ledgers` below the cap if you want a calmer signal on testnet.

## Deployments

| Network | Registry | Wasm hash | Deployed |
| --- | --- | --- | --- |
| Testnet | [`CC4TQFW5GLQTOKWTDE7IJWPQFWJ4NWVMJGBFWB76PUP3T7CEOVVSQW6O`](https://stellar.expert/explorer/testnet/contract/CC4TQFW5GLQTOKWTDE7IJWPQFWJ4NWVMJGBFWB76PUP3T7CEOVVSQW6O) | `c1ed6c44…862c` | 2026-11-02 |

Machine-readable record: [`deployments.json`](deployments.json). Mainnet is not
deployed yet; see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the sequence.

## Repository layout

```
soroban-sentinel/
├── contracts/registry/     # The watchlist contract (soroban-sdk 28, wasm32v1-none)
├── packages/sdk/           # TTL math, footprint keys, RPC scan, watchlist client
├── packages/cli/           # `sentinel` command
├── scripts/deploy.ts       # Upload + create + seed, no Stellar CLI needed
├── site/                   # Documentation site (GitHub Pages)
└── docs/                   # Architecture, CLI, contract spec, deployment, roadmap
```

## Development

```bash
make test        # cargo test + node --test
make clippy      # lints, warnings are errors
npm run typecheck
make wasm        # requires stellar-cli v25.2.0+
```

## Documentation

- Site: <https://streams-hq.github.io/stellar-stream-contract/>
- [Architecture](docs/ARCHITECTURE.md) — how TTL, footprints and risk scoring work
- [Contract spec](docs/CONTRACT_SPEC.md) — registry ABI, errors, events, invariants
- [Deployment](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md)

## Contributing

Issues labelled `Stellar Wave` are funded through
[Drips Wave](https://www.drips.network/wave/stellar). Start with
[`CONTRIBUTING.md`](CONTRIBUTING.md); `good first issue` is the entry point.

## Security

The registry holds no funds and has no privileged roles. Read
[`SECURITY.md`](SECURITY.md) before reporting anything, and do not open a public
issue for a vulnerability.

## License

MIT — see [`LICENSE`](LICENSE).
